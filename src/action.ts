import { getInput, error, setFailed, info } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import axios, { AxiosError } from 'axios';
import matter from 'gray-matter';
import path from 'path';
import fs from 'fs';
import FormData from 'form-data';

export async function run() {
    try {
        const token = getInput('github-token', { required: true });
        const url = getInput('request-url', { required: true });
        const secret = getInput('authorization-secret', { required: true });
        const client = getOctokit(token);
        const eventName = context.eventName;

        let base = ''
        let head = '';

        switch (eventName) {
            case 'pull_request':
                base = context.payload.pull_request?.base?.sha
                head = context.payload.pull_request?.head?.sha
                break
            case 'push':
                base = context.payload.before
                head = context.payload.after
                break
            default:
                setFailed(
                    `This action only supports pull requests and pushes, ${context.eventName} events are not supported. ` +
                    "Please submit an issue on this action's GitHub repo if you believe this in correct."
                )
        }


        info(`Base commit: ${base}`)
        info(`Head commit: ${head}`)

        if (!base || !head) {
            setFailed(
                `The base and head commits are missing from the payload for this ${context.eventName} event. ` +
                "Please submit an issue on this action's GitHub repo."
            )
        }

        const response = await client.rest.repos.compareCommits({
            base,
            head,
            owner: context.repo.owner,
            repo: context.repo.repo
        })

        // Ensure that the request was successful.
        if (response.status !== 200) {
            setFailed(
                `The GitHub API for comparing the base and head commits for this ${context.eventName} event returned ${response.status}, expected 200. ` +
                "Please submit an issue on this action's GitHub repo."
            )
        }

        // Ensure that the head commit is ahead of the base commit.
        if (response.data.status !== 'ahead') {
            setFailed(
                `The head commit for this ${context.eventName} event is not ahead of the base commit. ` +
                "Please submit an issue on this action's GitHub repo."
            )
        }


        const files = response.data.files;

        if (!files) {
            return setFailed('No files were changed in this commit');
        }


        const added: string[] = [],
            removed: string[] = [];

        for (const file of files) {
            const filename = file.filename;
            switch (file.status) {
                case 'added':
                    added.push(filename)
                    break
                case 'removed':
                    removed.push(filename)
                    break
                default:
                    setFailed(
                        `One of your files includes an unsupported file status '${file.status}', expected 'added'`
                    )
            }

        }

        const regex = new RegExp(/(posts\/)(.*)(\.md)/);

        for (let index = 0; index < added.length; index++) {
            const match = added[index].match(regex);
            if (match) {
                const postpath = path.join(process.cwd(), match[0]);
                const postname = match[2];
                if (postname && postpath) {
                    info("postname: " + postname);

                    const fileContents = fs.readFileSync(postpath, 'utf8')
                    const { data } = matter(fileContents);

                    const reqData = {
                        id: postname,
                        title: data.title,
                        des: data.description,
                        timestamp: data.timestamp,
                        source: `https://github.com/gp1699/saakhi-blogs/blob/main/${match[0]}`
                    }

                    let formData = new FormData();
                    for (let key in reqData) {
                        formData.append(key, reqData[key])
                    }

                    await sendRequest(formData, url, secret);
                }
            }
        }

        for (let index = 0; index < removed.length; index++) {
            const match = removed[index].match(regex);
            if (match) {
                const postname = match[2];
                if (postname) {
                    const reqData = {
                        delete: true
                    };

                    let formData = new FormData();
                    for (let key in reqData) {
                        formData.append(key, reqData[key])
                    }

                    await sendRequest(formData, url, secret);
                }
            }

        }



    } catch (err) {
        error(err as Error);
        setFailed((err as Error).message);
    }
}


async function sendRequest(data: FormData, url: string, secret: string) {
    await axios.post(url, data, { headers: { 'Authorization': secret } }).then((resp) => {
        info(resp.data as string)
    })
}

