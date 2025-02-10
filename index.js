const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const ACCESS_KEY = process.env.ACCESS_KEY // this access key must be sent through auth header on each request Bearer ACCESS_KEY for the request to be handled
const MASTER_ACCESS_KEY = process.env.MASTER_ACCESS_KEY // this key must be sent to execute admin-level requests

const app = express(); // all inputs are handled through json body
app.use(cors());
app.use(morgan('tiny'));
app.use(express.json());

DEFAULT_LEADERBOARD = {
    "dalle_desc_25": 1000,
    "dalle_desc_50": 1000,
    "dalle_desc_100": 1000,
    "dalle_desc_150": 1000,
    "dalle_desc_250": 1000,
    "desc_25_threshold_250": 1000,
    "desc_25_threshold_500": 1000,
    "desc_25_threshold_1000": 1000,
    "desc_250_threshold_250": 1000,
    "desc_250_threshold_500": 1000,
    "desc_250_threshold_1000": 1000,
    "jpeg_scale_2": 1000,
    "jpeg_scale_4": 1000,
    "jpeg_scale_8": 1000,
    "jpeg_scale_16": 1000,
    "jpeg_scale_32": 1000,
    "sa30_desc_50": 1000,
    "sa30_desc_100": 1000,
    "sa30_desc_150": 1000,
    "sa30_desc_250": 1000,
    "sd30_desc_25": 1000,
    "sd35_desc_25": 1000,
    "sd35_desc_50": 1000,
    "sd35_desc_100": 1000,
    "sd35_desc_150": 1000,
    "sd35_desc_250": 1000
}

const leaderboard = {}; // key: model name, value: current ELO score
const logs = []; // list of strings (line-separated) with the logs of calls performed (either /get, /vote, /admin/* - with which parameters for /vote)
// e.g.: "[02-02-2025T12:05:89] /get"
// e.g.: "[02-02-2025T12:05:89] /vote winner > loser (object)"
// note: the logs themselves should enable recreating the leaderboard at any time

async function init() {
    try {
        // Load leaderboard
        if (fs.existsSync('leaderboard.json')) {
            const data = await fs.promises.readFile('leaderboard.json', 'utf8');
            Object.assign(leaderboard, JSON.parse(data));
        } else {
            Object.assign(leaderboard, DEFAULT_LEADERBOARD);
            await fs.promises.writeFile('leaderboard.json', JSON.stringify(leaderboard, null, 2));
        }

        // Load logs
        if (fs.existsSync('logs.log')) {
            const logsData = await fs.promises.readFile('logs.log', 'utf8');
            logs.push(...logsData.split('\n').filter(log => log.trim()));
        } else {
            await fs.promises.writeFile('logs.log', '');
        }
    } catch (error) {
        console.error('Error in init:', error);
        throw error;
    }
}

// Helper function to validate access key
function validateAccessKey(req, res, isMaster = false) {
    const authHeader = req.headers.authorization;
    console.log(req.body);
    console.log(req.headers.authorization);
    const endpoint = req.originalUrl;  // Get the endpoint path
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        appendLog(`${endpoint} - Error: Unauthorized - Missing or invalid authorization header`).catch(console.error);
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return false;
    }
    const key = authHeader.split(' ')[1];
    if (isMaster && key !== MASTER_ACCESS_KEY) {
        appendLog(`${endpoint} - Error: Forbidden - Invalid master access key`).catch(console.error);
        res.status(403).json({ error: 'Invalid master access key' });
        return false;
    }
    if (!isMaster && key !== ACCESS_KEY && key !== MASTER_ACCESS_KEY) {
        appendLog(`${endpoint} - Error: Forbidden - Invalid access key`).catch(console.error);
        res.status(403).json({ error: 'Invalid access key' });
        return false;
    }
    return true;
}

// Helper function to append log
async function appendLog(logEntry) {
    const timestamp = new Date().toISOString();
    const formattedLog = `[${timestamp}] ${logEntry}`;
    logs.push(formattedLog);
    await fs.promises.appendFile('logs.log', formattedLog + '\n');
}

// Helper function to log errors with full stack trace
function logError(endpoint, error) {
    console.error('=== Error Details ===');
    console.error(`Endpoint: ${endpoint}`);
    console.error('Timestamp:', new Date().toISOString());
    console.error('Error:', error);
    console.error('Stack:', error.stack);
    console.error('==================\n');
}

app.get('/get', async (req, res) => {
    try {
        if (!validateAccessKey(req, res)) return;
        await appendLog('/get');
        res.json(leaderboard);
    } catch (error) {
        logError('/get', error);
        await appendLog(`/get - Error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/admin/status', async (req, res) => {
    try {
        if (!validateAccessKey(req, res, true)) return;
        const logsSize = fs.statSync('logs.log').size / (1024 * 1024);
        const status = {
            size_mb_logs: parseFloat(logsSize.toFixed(2)),
            total_requests: logs.length,
            total_models: Object.keys(leaderboard).length,
            last_request: logs[logs.length - 1] || null
        };
        await appendLog('/admin/status');
        res.json(status);
    } catch (error) {
        logError('/admin/status', error);
        await appendLog(`/admin/status - Error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/admin/get-logs', async (req, res) => {
    try {
        if (!validateAccessKey(req, res, true)) return;
        await appendLog('/admin/get-logs');
        res.json(logs);
    } catch (error) {
        logError('/admin/get-logs', error);
        await appendLog(`/admin/get-logs - Error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/admin/reset-leaderboard', async (req, res) => {
    try {
        if (!validateAccessKey(req, res, true)) return;
        Object.assign(leaderboard, DEFAULT_LEADERBOARD);
        await fs.promises.writeFile('leaderboard.json', JSON.stringify(leaderboard, null, 2));
        await appendLog('/admin/reset-leaderboard');
        res.json({ message: 'Leaderboard reset successfully' });
    } catch (error) {
        logError('/admin/reset-leaderboard', error);
        await appendLog(`/admin/reset-leaderboard - Error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/admin/reset-logs', async (req, res) => {
    try {
        if (!validateAccessKey(req, res, true)) return;
        logs.length = 0;
        await fs.promises.writeFile('logs.log', '');
        await appendLog('/admin/reset-logs');
        res.json({ message: 'Logs reset successfully' });
    } catch (error) {
        logError('/admin/reset-logs', error);
        await appendLog(`/admin/reset-logs - Error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/vote', async (req, res) => {
    try {
        if (!validateAccessKey(req, res)) return;
        const { winner, loser, object } = req.body;
        
        if (!winner || !loser || !object) {
            const error = new Error('Missing required parameters');
            logError('/vote', error);
            await appendLog(`/vote - Error: Missing required parameters`);
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        
        if (!leaderboard[winner] || !leaderboard[loser]) {
            const error = new Error(`Invalid model names (${winner}, ${loser})`);
            logError('/vote', error);
            await appendLog(`/vote - Error: Invalid model names (${winner}, ${loser})`);
            return res.status(400).json({ error: 'Invalid model names' });
        }

        // ELO calculation
        const K = 32;
        const expectedScoreWinner = 1 / (1 + Math.pow(10, (leaderboard[loser] - leaderboard[winner]) / 400));
        const expectedScoreLoser = 1 - expectedScoreWinner;

        leaderboard[winner] = Math.round(leaderboard[winner] + K * (1 - expectedScoreWinner));
        leaderboard[loser] = Math.round(leaderboard[loser] + K * (0 - expectedScoreLoser));

        await fs.promises.writeFile('leaderboard.json', JSON.stringify(leaderboard, null, 2));
        await appendLog(`/vote ${winner} > ${loser} (${object})`);
        
        res.json({ message: 'Vote recorded successfully', leaderboard });
    } catch (error) {
        logError('/vote', error);
        await appendLog(`/vote - Error: ${error.message}`);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 3000;
init().then(() => {
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}).catch(error => {
    console.error(`Error initializing server: ${error}`);
});
