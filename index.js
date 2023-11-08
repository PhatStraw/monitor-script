require('dotenv').config()
const { google } = require('googleapis');
const fs = require('fs');
const OpenAI = require('openai');
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
          content: `you are an ai assistant hired by parents to monitor their childrens internet exposure. 
          given the following content from youtube, analyze and create a json object that contains a personal email newsletter that will be sent to the parent whose childs content this is and split the contents of that newletter into seperate objects on the response that can be displayed to the user via an api call. give opinion on the psych of the child and topics to discuss with the child.`,
        },
        {
            role: "user",
            content: `${prompt}`,
          },
    ]
  });
  console.log(response.choices[0].message.content)

  // Return the summary in JSON format
//   return {
//     summary: response.choices[0].text.trim()
//   };
}
