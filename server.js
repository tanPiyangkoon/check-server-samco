require('dotenv').config();
var ping = require('ping');
const express = require('express');
const cors = require("cors");
const cron = require('node-cron');
const moment = require('moment-timezone'); 
const { Client } = require('@elastic/elasticsearch');
const axios = require('axios'); // ✅ เพิ่ม axios

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

// 📌 ตั้งค่า Slack Webhook URL
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || 'https://hooks.slack.com/services/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';

// 📌 รายชื่อเซิร์ฟเวอร์ที่ต้อง Ping
const hosts = [
    '192.168.1.1', '192.168.1.11', '192.168.1.6', 
    '192.168.1.18', '192.168.1.9', '192.168.2.34'
];

// 📌 ฟังก์ชันแปลงเวลาให้เป็น ISO 8601
function getISOTime() {
    return moment().tz("Asia/Bangkok").toISOString();
}

// 📌 ฟังก์ชันส่งข้อมูลไปยัง Slack
async function sendToSlack(host, alive) {
    try {
        const statusText = alive ? "✅ UP" : "❌ DOWN";
        const message = {
            text: `🔍 *Server Status Update*\n🔹 Host: *${host}*\n🔹 Status: *${statusText}*\n🔹 Time: ${getISOTime()}`
        };

        await axios.post(SLACK_WEBHOOK_URL, message);
        console.log(`📩 Sent to Slack: ${host} - ${statusText}`);
    } catch (error) {
        console.error('❌ Error sending to Slack:', error);
    }
}

// 📌 ฟังก์ชันบันทึก Log ไปที่ Elasticsearch
async function logToElasticsearch(host, alive) {
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
        console.error('❌ Error logging to Elasticsearch:', error);
    }
}

// 📌 ตั้ง Cron Job ให้ Ping ทุก 5 นาที
cron.schedule('*/5 * * * *', async () => {
    for (let host of hosts) {
        let rs = await ping.promise.probe(host);
        await logToElasticsearch(rs.host, rs.alive);
        await sendToSlack(rs.host, rs.alive); // ✅ ส่งไปที่ Slack
    }
});

// 📌 API สำหรับ Ping แบบ Manual
app.get('/ping', async (req, res) => {
    let results = [];
    for (let host of hosts) {
        let rs = await ping.promise.probe(host);
        await logToElasticsearch(rs.host, rs.alive);
        await sendToSlack(rs.host, rs.alive); // ✅ ส่งไปที่ Slack
        results.push(rs);
    }
    res.json({ results });
});

// 📌 เปิดเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`✅ Server is running on port: ${PORT}`);
});
