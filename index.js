import fetch from "node-fetch";
import queryString from "query-string";
import open from "open";
import moment from "moment";
import { parse } from "csv-parse/sync";
import fs from "fs";
import {Command} from "commander";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const client_id = '***REMOVED***'

async function main() {
    const cli = new Command()
        .name('issuesheet')
        .description('Creates GitHub issues from a CSV file.')
        .version('1.0.0')
        .requiredOption('-c, --csv <csv_path>', 'path to CSV')
        .requiredOption('-r, --repo <repo_name>', 'GitHub repo name')
        .option('--title_col <title_col>', 'name of column used for issue title', 'Description:')
        .option('--body_cols <body_cols...>', 'name of columns used for issue body', ['Type:', 'Category:', 'Priority:', 'Notes:', 'Attachments:']);

    cli.parse();

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

    console.log("Successfully authenticated.");

    console.log("Parsing issues from CSV file...");

    const file = fs.readFileSync(cli.opts()['csv']).toString()


    const issues = parse(file, {
        columns: true,
        skip_empty_lines: true
    }).map(row => { return {
        title: row[cli.opts()['title_col']],
        desc: cli.opts()['body_cols'].map(col => {
            `${col} ${row[col]}`
        }).join('\n').trimEnd()
    }});

    const user = await (fetch("https://api.github.com/user", {
        headers: {
            'Accept': 'application/vnd.github+json',
            'User-Agent': 'Issuesheet (Will BL)',
            'Authorization': `Bearer ${token}`
        }
    }).then(r => r.json()).then(j => j['login']));

    const repo = cli.opts()['repo'].includes('/') ? cli.opts()['repo'] : `${user}/${cli.opts()['repo']}`;

    for (const issue of issues) {
        console.log(JSON.stringify(issue));

        const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github+json',
                'User-Agent': 'Issuesheet (Will BL)',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                'title': issue.title,
                'body': issue.body
            })
        });

        if (res.ok) {
            console.log(`Created issue #${(await res.json())['number']}.`)
        } else {
            console.error(`Failed to create issue! Error ${res.status}. Quitting.`);
            return;
        }
    }

    console.log("Complete!");
}

await main();