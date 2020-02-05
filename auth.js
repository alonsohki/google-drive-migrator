const fs = require("fs");
const readline = require("readline");
const {google} = require("googleapis");

const SCOPES = ['https://www.googleapis.com/auth/drive'];

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, tokenPath, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
    });
    console.log(`Authorize this app by visiting this url: ${authUrl}`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question("Enter the code from that page here: ", (code) => {
        rl.close();

        oAuth2Client.getToken(code, (err, token) => {
            if (err) return callback(`Error retrieving access token ${err}`);

            oAuth2Client.setCredentials(token);
            fs.writeFileSync(tokenPath, JSON.stringify(token));
            callback(null, oAuth2Client);
        });
    });
  }  

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, tokenPath, callback) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
    fs.readFile(tokenPath, (err, token) => {
        if (err) return getAccessToken(oAuth2Client, tokenPath, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(null, oAuth2Client);
    });
  }

module.exports.authorize = function(credentialsPath, tokenPath) {
    return new Promise((resolve, reject) => {
        fs.readFile(credentialsPath, (err, content) => {
            if (err) return reject(`Error loading client secret file: ${err}`);
            authorize(JSON.parse(content), tokenPath, (err, oAuth2Client) => {
                if (err) return reject(err);
                resolve(oAuth2Client);
            });
        });
    });
}
