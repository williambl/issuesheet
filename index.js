import fetch from "node-fetch";
import queryString from "query-string";
import open from "open";
import moment from "moment";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const client_id = '***REMOVED***'

async function main() {
    console.log("Logging into GitHub...")
    const authCodesRes = await fetch(`https://github.com/login/device/code?client_id=${client_id}`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'Issuesheet (Will BL)'
        }
    });

    if (!authCodesRes.ok) {
        console.error(`Failure logging into GitHub. ${authCodesRes.status} ${authCodesRes.statusText} ${await authCodesRes.text()}`);
        return;
    }

    const {device_code, user_code, verification_uri, expires_in, interval} = await authCodesRes.json();

    console.log("Please enter the following code in the GitHub website: ");
    console.log(user_code);
    console.log(`\n (If the website did not open, the URL is: ${verification_uri})`);
    open(verification_uri);

    const expiryTime = moment.now() + expires_in * 1000;
    let tokenJson = null;

    while (!tokenJson) {
        await delay(interval * 1000);
        if (moment.now() >= expiryTime) {
            console.error("Failure logging in. Timed out.");
            return;
        }

        const tokenRes = await fetch(`https://github.com/login/oauth/access_token?${queryString.stringify({client_id: client_id, device_code: device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code'})}`, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Issuesheet (Will BL)'
            }
        });

        if (tokenRes.ok) {
            tokenJson = await tokenRes.json();
            if (tokenJson.error) {
                tokenJson = null;
            }
        }
    }

    const {token, token_type, bearer} = tokenJson;
}

await main();