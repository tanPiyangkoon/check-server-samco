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

// 📌 ตั้งค่า Elasticsearch
const esClient = new Client({
    node: 'http://10.2.114.76:9200',
    auth: {
        username: process.env.ELASTIC_USER || 'elastic',
        password: process.env.ELASTIC_PASS || 'changeme'
    }
});


const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1349302327655272448/ZaFUL9MZ4dqxiBw7PYsJrJDtmkN12ydL1696eEpH_2PcV9EgLgEKbqQmx0aTScJH7lKB';

// 📌 รายชื่อเซิร์ฟเวอร์ที่ต้อง Ping
const hosts = [
    '192.168.1.1', '192.168.1.11', '192.168.1.6', 
    '192.168.1.18', '192.168.1.9', '192.168.2.34'
];

// 📌 ฟังก์ชันแปลงเวลาให้เป็น ISO 8601
function getISOTime() {
    return moment().tz("Asia/Bangkok").toISOString();
}


async function sendToDiscord(host, alive, retryCount = 0) {
    try {
        const statusText = alive ? "✅ UP" : "❌ DOWN";
        const color = alive ? 3066993 : 15158332; // สี: เขียว (UP) / แดง (DOWN)
        
        const message = {
            username: "Server Monitor",
            embeds: [
                {
                    title: "🔍 Server Status Update",
                    description: `🔹 **Host:** \`${host}\`\n🔹 **Status:** **${statusText}**\n🔹 **Time:** ${getISOTime()}`,
                    color: color
                }
            ]
        };

        const response = await axios.post(DISCORD_WEBHOOK_URL, message);
        if (response.status === 204) {
            console.log(`📩 Sent to Discord: ${host} - ${statusText}`);
        } else {
            throw new Error(`Unexpected response from Discord: ${response.status}`);
        }
    } catch (error) {
        console.error(`❌ Error sending to Discord (Retry ${retryCount}):`, error.message);
        
        // ลองส่งใหม่ถ้ายังไม่ถึง retry limit (3 ครั้ง)
        if (retryCount < 3) {
            console.log("♻️ Retrying...");
            await new Promise(res => setTimeout(res, 2000)); // รอ 2 วินาที
            return sendToDiscord(host, alive, retryCount + 1);
        }
    }
}

// 📌 ฟังก์ชันบันทึก Log ไปที่ Elasticsearch
async function logToElasticsearch(host, alive, retryCount = 0) {
    try {
        const timestamp = getISOTime(); 
        await esClient.index({
            index: 'server_status',
            body: {
                timestamp: timestamp,
                host: host,
                alive: alive
            }
        });
        console.log(`📌 Logged to Elasticsearch: ${host} - Alive: ${alive} - Time: ${timestamp}`);
    } catch (error) {
        console.error(`❌ Error logging to Elasticsearch (Retry ${retryCount}):`, error.message);
        
        // ลองส่งใหม่ถ้ายังไม่ถึง retry limit (3 ครั้ง)
        if (retryCount < 3) {
            console.log("♻️ Retrying...");
            await new Promise(res => setTimeout(res, 2000)); // รอ 2 วินาที
            return logToElasticsearch(host, alive, retryCount + 1);
        }
    }
}

// 📌 ตั้ง Cron Job ให้ Ping ทุก 5 นาที
cron.schedule('*/5 * * * *', async () => {
    console.log(`🔄 Running Scheduled Ping at ${getISOTime()}`);

    for (let host of hosts) {
        let rs = await ping.promise.probe(host);
        await logToElasticsearch(rs.host, rs.alive);
        await sendToDiscord(rs.host, rs.alive);
    }

    console.log(`✅ Finished Scheduled Ping at ${getISOTime()}`);
});

// 📌 API สำหรับ Ping แบบ Manual
app.get('/ping', async (req, res) => {
    console.log(`📢 Manual Ping Requested at ${getISOTime()}`);
    let results = [];
    
    for (let host of hosts) {
        let rs = await ping.promise.probe(host);
        await logToElasticsearch(rs.host, rs.alive);
        await sendToDiscord(rs.host, rs.alive);
        results.push(rs);
    }

    res.json({ results });
});

// 📌 เปิดเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`✅ Server is running on port: ${PORT}`);
});
