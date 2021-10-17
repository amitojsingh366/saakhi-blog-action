import { getInput, error, setFailed, info } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import axios, { AxiosError } from 'axios';
import matter from 'gray-matter';
import path from 'path';

export async function run() {
    try {
        const token = getInput('github-token', { required: true });
        // const url = getInput('request-url', { required: true });
        // const secret = getInput('authorization-secret', { required: true });

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


        const added: string[] = [];

        for (const file of files) {
            const filename = file.filename;
            switch (file.status) {
                case 'added':
                    added.push(filename)
                    break

                default:
                    setFailed(
                        `One of your files includes an unsupported file status '${file.status}', expected 'added'`
                    )
            }

        }

        info(added[0])


        const regex = new RegExp(/(.*\/)(.*)(\.md)/gm);

        for (let index = 0; index < added.length; index++) {
            const match = added[index].match(regex);
            if (match) {
                const postname = match[1];
                if (postname) {
                    info(postname);
                    // https://app.sikhsaakhi.com/website/blog/new_post.php

                }
            }
        }



    } catch (err) {
        error(err as Error);
        setFailed((err as Error).message);
    }
}

