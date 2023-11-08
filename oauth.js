const { google } = require('googleapis');
const readline = require('readline');
const OAuth2 = google.auth.OAuth2;
const fs = require('fs');
const TOKEN_PATH = 'token.json';

const oauth2Client = new OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRETS,
    "http://localhost:3000"
);

// generate a url that asks permissions for YouTube scopes
const scopes = ["https://www.googleapis.com/auth/youtube.force-ssl","https://www.googleapis.com/auth/youtube.readonly"];

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: scopes,
});

console.log('Authorize this app by visiting this url:', url);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    const decodedCode = decodeURIComponent(code);
    oauth2Client.getToken(decodedCode, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
    });
  });