import 'dotenv/config'
import * as fs from "fs";
import * as path from "path";
import {encoding_for_model} from "tiktoken";
import {OpenAI} from "openai";

const TOKEN_LIMIT = 15000

function log(...args) {
    console.log('Summarizer: ', ...args)
}

const openai = new OpenAI({
    apiKey: process.env.API_KEY,
});

function delay(time) {
    // Return a new promise
    return new Promise(resolve => setTimeout(resolve, time));
}


export async function getPromptAndTranscript(filePath) {
    const fileContents = fs.readFileSync(filePath, 'utf-8')
    if (!fileContents) {
        throw new Error('File is empty')
    }
    let [prompt, transcript] = fileContents.split('---')
    prompt = prompt ? prompt.trim() : ''
    transcript = transcript ? transcript.trim() : ''
    if (!prompt) {
        throw new Error('Prompt must be defined at the start of the file')
    }
    if (!transcript) {
        throw new Error('Transcript must be defined after prompt in the file')
    }
    return [prompt, transcript]
}

export async function processPromptAndTranscript(prompt, transcript) {

    // ....
    // output file
}

export function getOutputFileName(inputFileName) {
    const fullPath = path.resolve(inputFileName)
    const dir = path.dirname(fullPath)
    const fileName = path.basename(fullPath)
    const ext = path.extname(fullPath)
    const newFileName = fileName.replace(ext, '-trsu.txt');
    return path.resolve(dir, newFileName)
}

export async function main(filePath) {
    log('Reading file')
    const [prompt, transcript] = await getPromptAndTranscript(filePath)
    const transcriptChunks = splitIntoChunks(transcript)
    log('Chunks count:', transcriptChunks.length)
    const summarizer = await openai.beta.assistants.create({
        model: 'gpt-3.5-turbo',
        instructions: "You are a person who summarizes provided transcripts",
        name: "transcript-summarizer",
    })
    log('Assistant created:', summarizer)
    const thread =  await openai.beta.threads.create();
    log('Thread created:', thread)
    for (let i = 0; i < transcriptChunks.length; i+= 1) {
        const message = await openai.beta.threads.messages.create(
            thread.id,
            {
                role: "user",
                content: transcriptChunks[i],
            }
        )
        log('Message added to the thread:', message)
    }
    await openai.beta.threads.messages.create(
        thread.id,
        {
            role: "user",
            content: prompt,
        }
    )
    log('Added prompt to the thread')
    const assistantRun = await openai.beta.threads.runs.create(
        thread.id,
        {
            assistant_id: summarizer.id
        }
    )
    log('Run:', assistantRun)

    async function processRunResults() {
        log('Processing run results...')
        const runStatus = await openai.beta.threads.runs.retrieve(
            thread.id,
            assistantRun.id
        );
        log('Run status:', runStatus)
        if (runStatus.status === 'completed') {
            const allMessages = await openai.beta.threads.messages.list(
                thread.id
            );
            const replyText = allMessages.data[0].content[0].text.value
            fs.writeFileSync(getOutputFileName(filePath), replyText, 'utf-8')
        } else {
            await delay(1000)
            return processRunResults()
        }
    }
    await processRunResults()
}

const enc = encoding_for_model('gpt-3.5-turbo-16k')
function getTokenCount(text) {
    return enc.encode(text).length
}

//
export function splitIntoChunks(text) {
    let res = []
    let sentences = text.split(/\n/)
    let chunk = ''
    let chunkSize = 0
    for (let i = 0; i < sentences.length; i += 1) {
        let sentence = sentences[i]
        let sentenceSize = getTokenCount(sentence)
        if (chunkSize + sentenceSize < TOKEN_LIMIT) {
            chunkSize += sentenceSize
            chunk = chunk + sentence + '\n'
        } else {
            res.push(chunk)
            chunk = sentence
            chunkSize = sentenceSize
        }
        console.log('\n')
    }
    res.push(chunk)
    return res
}
