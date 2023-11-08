require('dotenv').config()
const { google } = require('googleapis');
const fs = require('fs');
const OpenAI = require('openai');
const nodemailer = require('nodemailer');
const TOKEN_PATH = 'token.json';
const OUTPUT_PATH = 'output.json';

const openai = new OpenAI({
    openAIApiKey: process.env.OPENAI_API_KEY,
});

const OAuth2 = google.auth.OAuth2;

const oauth2Client = new OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRETS,
    "http://localhost:3000"
);
// Check if we have previously stored a token.
fs.readFile(TOKEN_PATH, (err, token) => {
  if (err) return console.error('No token found');
  oauth2Client.setCredentials(JSON.parse(token));
//   getUserData(oauth2Client);
  summarizeContent().then(summary => console.log(summary));
});

async function getUserData(auth) {
  const service = google.youtube("v3");
  const data = {};

  // Get liked videos
  const likedVideosResponse = await service.playlistItems.list({
    auth: auth,
    part: "snippet",
    playlistId: "LL", // LL is the playlist ID for the liked videos
    maxResults: 50,
  }).catch(err => console.error("Error retrieving liked videos: " + err));
  data.likedVideos = likedVideosResponse.data.items;

  // Get subscriptions
  const subscriptionsResponse = await service.subscriptions.list({
    auth: auth,
    part: "snippet",
    mine: true,
    maxResults: 50,
  }).catch(err => console.error("Error retrieving subscriptions: " + err));
  data.subscriptions = subscriptionsResponse.data.items;

// Get last uploaded video for each subscription
for (let i = 0; i < data.subscriptions.length; i++) {
    const channelId = data.subscriptions[i].snippet.resourceId.channelId;
    const uploadsResponse = await service.search.list({
        auth: auth,
        part: "snippet",
        channelId: channelId,
        type: 'video',
        order: 'date', // to ensure the latest video comes first
        maxResults: 1,
    }).catch(err => console.error("Error retrieving uploads: " + err));
    data.subscriptions[i].lastUploadedVideo = uploadsResponse.data.items[0];
    }

  // Get uploaded videos
  const uploadedVideosResponse = await service.search.list({
    auth: auth,
    part: "snippet",
    forMine: true,
    type: 'video',
    maxResults: 50,
  }).catch(err => console.error("Error retrieving uploaded videos: " + err));
  data.uploadedVideos = uploadedVideosResponse.data.items;

  const activities = await service.activities.list({
    'part': 'snippet,contentDetails',
    'mine': true,
    'maxResults': '10',
    'key': process.env.API_KEY
  }).catch(err => console.error("Error retrieving uploaded videos: " + err));
  console.log(activities)
  // Write data to file
  fs.writeFile(OUTPUT_PATH, JSON.stringify(data, null, 2), (err) => {
    if (err) return console.error(err);
    console.log('Data stored to', OUTPUT_PATH);
  });
}

async function summarizeContent() {
  // Read the data from the output.json file
  const data = JSON.parse(fs.readFileSync('output.json', 'utf8'));

  // Extract the liked videos and subscriptions
  const likedVideos = data.likedVideos;
  const subscriptions = data.subscriptions;

  // Prepare the prompt for the GPT-3 model
  let prompt = "Summarize the following YouTube content:\n\n";

  prompt += "Liked Videos:\n";
  likedVideos.forEach(video => {
    prompt += `- ${video.snippet.title}: ${video.snippet.description}\n`;
  });

  prompt += "\nSubscriptions:\n";
  subscriptions.forEach(subscription => {
    prompt += `- ${subscription.snippet.title}: ${subscription.snippet.description}\n`;
  });

  // Use the ChatGPT model to generate a summary
  const response = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    response_format: {type: "json_object"},
    messages: [
        {
          role: "system",
          content: `
          you are an ai assistant hired by parents to monitor their 
          childrens internet exposure. 

          given the following content from youtube, analyze 
          and create a json object that contains a personal 
          email newsletter that will be sent to the parent
          whose childs content this is and split the contents 
          of that newletter into seperate objects on the response 
          that can be displayed to the user via an api call. 
          give opinion on the psych of the child and topics to 
          discuss with the child.
          
          response should be in the following format:
          {
            "email_newsletter": {
              "subject": "Your Child's Recent YouTube Activity - Insightful Overview and Discussion Topics",
              "greeting": "Dear Parent,",
              "introduction": "",
              "content_analysis": [
                {
                  "topic": "",
                  "content": ""
                },
                {
                  "topic": "",
                  "content": ""
                },
                {
                  "topic": "",
                  "content": ""
                },
                {
                  "topic": "",
                  "content": "."
                }
              ],
              "psych_analysis": {
                "overview": "",
                "topics_to_discuss": [
                  "",
                  "",
                  "",
                  ""
                ]
              },
              "closing": "",
              "sign_off": ""
            }
          }
          `,
        },
        {
            role: "user",
            content: `${prompt}`,
          },
    ]
  });
  const parsed = JSON.parse(response.choices[0].message.content)
  console.log(parsed)

  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'kevindsims1@gmail.com',
      pass: 'azzz amet ydyd qmjo'
    }
  });

  let mailOptions = {
    from: 'kevindsims1@gmail.com',
    to: 'Willscottmoss@gmail.com',
    subject: "Your Child's Recent YouTube Activity - Insightful Overview and Discussion Topics",
    html: `
    <html>
      <head>
        <style>
          /* Add your custom CSS styles here */
        </style>
      </head>
      <body>
        <h1>Your Child's Recent YouTube Activity</h1>
        <p>Dear Parent,</p>
        <p>${parsed.email_newsletter.introduction}</p>
        
        <h2>Content Analysis</h2>
        <ul>
          ${parsed.email_newsletter.content_analysis.map(analysis => `
            <li>
              <h3>${analysis.topic}</h3>
              <p>${analysis.content}</p>
            </li>
          `).join('')}
        </ul>
        
        <h2>Psychological Analysis</h2>
        <p>${parsed.email_newsletter.psych_analysis.overview}</p>
        <h3>Topics to Discuss:</h3>
        <ul>
          ${parsed.email_newsletter.psych_analysis.topics_to_discuss.map(topic => `
            <li>${topic}</li>
          `).join('')}
        </ul>
        
        <p>${parsed.email_newsletter.closing}</p>
        <p>${parsed.email_newsletter.sign_off}</p>
      </body>
    </html>
  `
  };

  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
      console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  });
  // Return the summary in JSON format
//   return {
//     summary: response.choices[0].text.trim()
//   };
}


// {
//     "email_newsletter": {
//       "subject": "Your Child's Recent YouTube Activity - Insightful Overview and Discussion Topics",
//       "greeting": "Dear Parent,",
//       "introduction": "We hope this email finds you well. As part of our ongoing commitment to support your child’s healthy internet usage, we present you with an analysis of their recent YouTube activities. It is designed to give you insights into their interests and how they might be spending their online time.",
//       "content_analysis": [
//         {
//           "topic": "Entrepreneurship and Startups",
//           "content": "Your child has shown an interest in startup culture and entrepreneurship. Videos from Y Combinator, MicroConf, and various founders indicate a curiosity about business formation, growth, and the tech industry. The focus on SaaS (Software as a Service) startups suggests a specific interest in this area."
//         },
//         {
//           "topic": "Personal Development",
//           "content": "Content liked by your child includes tips on productivity, personal growth, and making impactful life choices. This could reflect a mature approach to self-improvement and time management at a young age."
//         },
//         {
//           "topic": "Technology and Innovation",
//           "content": "There is a clear inclination towards technology, specifically in areas like AI, web development, and software engineering. Your child may be exploring tech as a field of study or a potential career path."
//         },
//         {
//           "topic": "Financial Literacy",
//           "content": "Engagement with videos from True Link Financial indicates an interest in financial independence and perhaps a consideration for people with special requirements. This insight could denote empathy as well as financial curiosity."
//         }
//       ],
//       "psych_analysis": {
//         "overview": "The content liked by your child points towards a high level of intellectual curiosity, especially in areas of high cognitive demand such as entrepreneurship and technology. They may possess a forward-thinking mindset, and their interest in self-improvement material may indicate an understanding of the value of personal growth.",
//         "topics_to_discuss": [
//           "Aspirations within the realms of entrepreneurship and whether they have considered creating or leading projects of their own.",
//           "Their thoughts on personal productivity and if they have implemented any strategies from their viewing materials.",
//           "Understanding of financial concepts and whether they have thoughts on financial planning or independence.",
//           "Technology's role in society and ethical considerations, especially in regards to AI, which appears to be of interest."
//         ]
//       },
//       "closing": "It is wonderful to see your child engaging with content that could be shaping a growth-oriented and innovative mindset. We encourage you to discuss these topics with them; such conversations can provide guidance and support as they explore their potential. If you have any questions or need further resources to facilitate these discussions, please do not hesitate to reach out.",
//       "sign_off": "Warm regards,\nYour Dedicated AI Assistant"
//     }
//   }