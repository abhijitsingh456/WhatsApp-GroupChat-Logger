import { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadMediaMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom'

import pino from 'pino';
import dotenv from 'dotenv'
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

import promisesFs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __fileName = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__fileName);

const AUTH_DIR = path.join(__dirname,'auth_info');
const MEDIA_DIR = path.join(__dirname,'downloads');
const CHAT_DIR = path.join(__dirname,'group_chats');
const CSV_HEADERS = ['messageId', 'groupJid', 'senderJid', 'pushName', 'messageType', 'textContent', 'sentAt'];

let GROUP_ID = null;

async function acceptGroupId(groups){
    const rl = readline.createInterface({ input, output });
    const id = await rl.question('Enter Group ID\n'); 
    if(groups.has(id)){
        GROUP_ID = id;
        console.log("GROUP CONNECTED."); 
        rl.close();
    }else{
        console.log("Incorrect GROUP ID. Exiting...");
        process.exit(1);
    }
}
 
function extractText(message){
    if(!message){
        return null;
    }
    return(message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.caption ||
        null
    );
}
   
async function logMessageToCSV(rowObject){
    if(!fs.existsSync(CHAT_DIR)){
        fs.mkdirSync(CHAT_DIR, { recursive: true });
    }
    const filePath = path.join(CHAT_DIR, GROUP_ID.split('@')[0]+'.csv');
    try{
        const fileExists = fs.existsSync(filePath);
        let content = '';
        if(!fileExists){
            content+=CSV_HEADERS.join(',')+'\n';
        }

        const sanitizedRow = CSV_HEADERS.map(headerName => {
            const rawValue = rowObject[headerName] ?? '';
            //string sanitization
            const stringValue = String(rawValue).replace(/"/g, '""""');
            return /[",\n\r]/.stringValue ? `"${stringValue}"` : stringValue;

        });

        content+=sanitizedRow.join(',')+'\n';
        await promisesFs.appendFile(filePath, content, 'utf8');
        console.log("Appended message to csv file.");
    }catch (err){
        //console.log(err);
        console.log("Failed to append message to csv file.");
    }
}

function extentionFromMimeType(mimeType){
    const knownMimeTypes = {
	'image/jpeg':'jpg',
	'image/png':'png',
	'image/webp':'webp',
	'image/gif':'gif'
	};
	if(!mimeType){ return 'bin'; }
	return knownMimeTypes[mimeType] || mimeType.split('/')[1]?.split(';')[0] || 'bin';

}

async function start(){
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'warn' })
    });

    sock.ev.on('creds.update', async() => {
        await saveCreds();
    })

    sock.ev.on('connection.update', async(update)=>{
        
        const { connection, lastDisconnect,  qr } = update;
        
        if(qr){
            qrcode.generate(qr, {small: true});
        }

        if(connection === 'close'){
            const statusCode = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : undefined;
            const shouldReconnect = statusCode != DisconnectReason.loggedOut;

            if(shouldReconnect){
                start();
            }
        }else if(connection === 'open'){
            console.log("CONNECTED.");
            if(GROUP_ID == null){
                const groups = await sock.groupFetchAllParticipating();
                            console.log("\n");
                const group_ids = new Set();
                for(const jid of Object.keys(groups)){
                    console.log(`${groups[jid].subject} -> ${jid}`);
                    group_ids.add(jid);
                }
                
                acceptGroupId(group_ids);
            } 
        }
    });

    sock.ev.on('messages.upsert', async({messages, type}) => {
        if(type!='notify') return;

        for(const msg of messages){
            if(!msg.message) continue;
        
            if(msg.key.remoteJid !== GROUP_ID){
                continue;
            }

            const textContent = extractText(msg.message);
            const messageType = Object.keys(msg.message)[0];
            if(messageType === 'imageMessage'){
                if(!fs.existsSync(MEDIA_DIR)){
                    fs.mkdirSync(MEDIA_DIR, { recursive: true });
                }
                try{
                    const buffer = await downloadMediaMessage(
                                msg,
                                'buffer',
                                {},
                                { logger: pino({level: 'warn' }), reuploadRequest: sock.updateMediaMessage });
                    const ext = extentionFromMimeType(msg.message.imageMessage.mimetype);
                    const fileName = `${msg.key.id}.${ext}`;
                    const mediaPath = path.join(MEDIA_DIR, fileName);
                    fs.writeFileSync(mediaPath, buffer);
                    console.log('Saved image to ', mediaPath);
                 }catch (err){
                    console.error('Failed to download image for ', msg.key.id, err);
                 } 
                
            }
        
            try{
                 let messageToPrint = {
                    messageId: msg.key.id,
                    groupJid: msg.key.remoteJid,
                    senderJid: msg.key.participant || msg.key.remoteJid,
                    pushName: msg.pushName || null,
                    messageType,
                    textContent,
                    rawPayload: msg,
                    sentAt: new Date(Number(msg.messageTimestamp) * 1000),
                };
                console.log("New Message Received.");
                logMessageToCSV(messageToPrint);
            }catch (err){
                console.error('Failed to store message', msg.key.id, err);
            }
        }
    });
}
start();
