Steps to use

Ensure you have node and npm installed.
1. Clone the repo - `git clone https://github.com/abhijitsingh456/WhatsApp-GroupChat-Logger.git`
2. cd into the directory - `cd WhatsApp-GroupChat-Logger`
3. Run `npm install` to install dependencies
4. Run `node index.js` to start the program
5. For the first time, it will display a QR on your screen to log in and connect your WhatsApp account (like you do in WhatsApp Web). It will save your credentials until you logout using your phone.
6. It will display the names of groups you are a member of along with the GROUP IDs and ask you to enter the GROUP ID of the group you want to save messages from - copy the group ID of that group, paste it and press Enter.  
7. Messages from that group will now be stored in a csv file (name of the file will be the GROUP ID) under the directory name 'group_chats' and images will be saved under the directory name 'downloads' with its name being the MESSAGE ID.

Note: This script makes direct use of the WhiskeySockets/Baileys library for its core implementation. Refer https://www.npmjs.com/package/baileys and  https://github.com/WhiskeySockets/Baileys/
