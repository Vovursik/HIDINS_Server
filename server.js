const WebSocket = require('ws');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const objectRandomizer = require('./objectRandomizer.js');

console.clear();
//-----------------------
const sessionsFile = 'sessions.json'
const filePath = path.join(__dirname, sessionsFile);

const newSessionData = {
    sessions: []
};

fs.writeFileSync(filePath, JSON.stringify(newSessionData, null, 4));
console.log('\x1b[90m%s\x1b[0m', `|> Clear file: ${sessionsFile}`);
//-----------------------

const serverPort = process.env.SERVER_PORT
const webSocket = new WebSocket.Server({ port: serverPort });

console.log('\x1b[90m%s\x1b[0m', `|> Websocket listening on: localhost:${serverPort}`);

const clientsMap = new Map();

let clientsCount = 0;
let waitingQueue = [];

webSocket.on('connection', (ws, req) => {
    console.log('\x1b[33m%s\x1b[0m', '|> New client connected.');
    clientsCount += 1;

    const clientId = uuidv4();
    console.log('\x1b[32m%s\x1b[0m', '|> Generated clientId:', clientId);

    clientsMap.set(clientId, ws);


    ws.send(JSON.stringify({
        type: 'Connecting to server successful',
        client_id: clientId,
    }));

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);

            if (parsedMessage.type === 'action') {
                let sessions = [...getParsedSessions()];

                const session = sessions.find(session => 
                    session.clients.some(client => client.client_id === clientId)
                );
                if (parsedMessage.description === 'add_to_waiting_queue' && !waitingQueue.includes(clientId) && !session)
                {
                    waitingQueue.push(clientId);
                    checkQueue();
                    console.log('\x1b[90m%s\x1b[0m', '|+ Client add to waiting queue:', clientId);
                }
            }

        } catch (error) {
            console.error('Error parsing JSON:', error);
        }
    });

    ws.on('close', () => {
        clientsMap.delete(clientId);
        const index = waitingQueue.indexOf(clientId);
        if (index !== -1) {
            waitingQueue.splice(index, 1);
            console.log('\x1b[90m%s\x1b[0m', '|- Client remove from waiting queue:', clientId);
        }
        removeSession(clientId);
        console.log('\x1b[31m%s\x1b[0m', '|> Client disconnected:', clientId);
      });
})

function checkQueue() {
    while (waitingQueue.length >= 2) {
        const client1 = waitingQueue.shift();
        const client2 = waitingQueue.shift();

        sessionId = uuidv4()
        const sessionData = {
            session_id: sessionId,
            start_time: new Date().toISOString(),
            clients: [
                { client_id: client1 },
                { client_id: client2 },
            ],
            items: [], 
        };

        // Сохраняем сессию в файл
        addSession(sessionData);

        const client1Socket = clientsMap.get(client1);
        const client2Socket = clientsMap.get(client2);

        if (client1Socket) {
            client1Socket.send(JSON.stringify({ 
                action: 'start_session', 
                session: sessionId
            }));
        }
        if (client2Socket) {
            client2Socket.send(JSON.stringify({ 
                action: 'start_session', 
                session: sessionId
            }));
        }
    }
}

function addSession(sessionData) {
    let sessions = [...getParsedSessions()];
    
    sessions.push(sessionData);
    fs.writeFileSync(filePath, JSON.stringify({ sessions: sessions }, null, 4), 'utf-8');
    console.log('\x1b[36m%s\x1b[0m', '|+ Session created:', sessionId);
}

function removeSession(clientId) {
    let sessions = [...getParsedSessions()];
    
    const updatedSessions = sessions.filter(session => 
        !session.clients.some(client => client.client_id === clientId)
    );

    if (updatedSessions.length === sessions.length) return;

    fs.writeFileSync(filePath, JSON.stringify({ sessions: updatedSessions }, null, 4), 'utf-8');
    console.log('\x1b[35m%s\x1b[0m', '|- Session deleted:', sessionId);
}

function getParsedSessions() {
    if (fs.existsSync(filePath)) {
        const fileData = fs.readFileSync(filePath, 'utf-8');
        try {
            sessions = JSON.parse(fileData).sessions || [];
            return sessions;
        }
        catch (err) {
            console.error("Ошибка при парсинге JSON:", err);
            return null;
        }
    }
}
