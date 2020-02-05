const {google} = require("googleapis");

async function migrate() {
    const auth = await require("./auth").authorize("credentials.json", "token.json");
    const drive = google.drive({version: 'v3', auth: auth});
    drive.files.list({
        pageSize: 10,
        fields: 'nextPageToken, files(id, name)',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        console.log(JSON.stringify(res));
        const files = res.data.files;
        if (files.length) {
            console.log('Files:');
            files.map((file) => {
                console.log(`${file.name} (${file.id})`);
            });
        } else {
            console.log('No files found.');
        }
    });
}

migrate();
