require('dotenv').config();
var ping = require('ping');
const express = require('express');
const cors = require("cors");
const cron = require('node-cron');
const moment = require('moment-timezone'); 
const { Client } = require('@elastic/elasticsearch');
const axios = require('axios'); 

const app = express();
const PORT = process.env.PORT || 5004;


const esClient = new Client({
    node: 'http://10.2.114.76:9200',
    auth: {
        username: process.env.ELASTIC_USER || 'elastic',
        password: process.env.ELASTIC_PASS || 'changeme'
    }
});

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1349302327655272448/ZaFUL9MZ4dqxiBw7PYsJrJDtmkN12ydL1696eEpH_2PcV9EgLgEKbqQmx0aTScJH7lKB';


const hosts = [
    '192.168.1.1', '192.168.1.11', '192.168.1.6', 
    '192.168.1.18', '192.168.1.9', '192.168.2.34'
];


function getISOTime() {
    return moment().tz("Asia/Bangkok").toISOString();
}


async function sendToDiscord(host, retryCount = 0) {
    try {
        const message = {
            username: "Server Monitor",
            embeds: [
                {
                    title: "🚨 Server Status Down",
                    description: `❌ **Host:** \`${host}\`\n🔹 **Status:** **DOWN**\n🔹 **Time:** ${getISOTime()}`,
                    color: 15158332 // สีแดง
                }
            ]
        };

        const response = await axios.post(DISCORD_WEBHOOK_URL, message);
        if (response.status === 204) {
            console.log(`📩 Sent to Discord: ${host} - ❌ DOWN`);
        } else {
            throw new Error(`Unexpected response from Discord: ${response.status}`);
        }
    } catch (error) {
        console.error(`❌ Error sending to Discord (Retry ${retryCount}):`, error.message);
        
        if (retryCount < 3) {
            console.log("♻️ Retrying...");
            await new Promise(res => setTimeout(res, 2000));
            return sendToDiscord(host, retryCount + 1);
        }
    }
}

async function logToElasticsearch(host, retryCount = 0) {
    try {
        const timestamp = getISOTime(); 
        await esClient.index({
            index: 'server_status',
            body: {
                timestamp: timestamp,
                host: host,
                alive: false // 
            }
        });
        console.log(`📌 Logged to Elasticsearch: ${host} - ❌ DOWN - Time: ${timestamp}`);
    } catch (error) {
        console.error(`❌ Error logging to Elasticsearch (Retry ${retryCount}):`, error.message);
        
        if (retryCount < 3) {
            console.log("♻️ Retrying...");
            await new Promise(res => setTimeout(res, 2000));
            return logToElasticsearch(host, retryCount + 1);
        }
    }
}


cron.schedule('*/5 * * * *', async () => {
    console.log(`🔄 Running Scheduled Ping at ${getISOTime()}`);

    try {
        for (let host of hosts) {
            let rs = await ping.promise.probe(host);

            if (!rs.alive) {
                await logToElasticsearch(rs.host);
                await sendToDiscord(rs.host);
            }
        }
    } catch (error) {
        console.error(`❌ Error in Scheduled Ping:`, error.message);
    }

    console.log(`✅ Finished Scheduled Ping at ${getISOTime()}`);
});


app.get('/ping', async (req, res) => {
    console.log(`📢 Manual Ping Requested at ${getISOTime()}`);
    let results = [];

    try {
        for (let host of hosts) {
            let rs = await ping.promise.probe(host);

            if (!rs.alive) {
                await logToElasticsearch(rs.host);
                await sendToDiscord(rs.host);
            }

            results.push(rs);
        }
    } catch (error) {
        console.error(`❌ Error in Manual Ping:`, error.message);
    }
    
    res.json({ results });
});


app.listen(PORT, () => {
    console.log(`✅ Server is running on port: ${PORT}`);
});
