const CACHE_NAME = 'penguin-zone-v3-fix';
const SHEET_ID = '1uYu86EAAGvIhhnnok5v007rvBxk_NvlknK7FFzgWqrE'; 
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

async function checkUpdates() {
    try {
        const isEnabled = await getNotificationEnabled();
        if (!isEnabled) return;

        const response = await fetch(`${CSV_URL}&t=${Date.now()}`);
        const text = await response.text();
        const rows = parseCSV(text);
        
        // กรองเอาเฉพาะแถวที่เป็น TRUE
        const activeRows = rows.slice(1).filter(r => r[0] && r[0].toUpperCase() === 'TRUE');
        
        // *** แก้ไขจุดสำคัญ: เลือกตัว "สุดท้าย" (activeRows.length - 1) คือตัวล่างสุดของ Sheet ***
        const latestVideo = activeRows[activeRows.length - 1];

        if (latestVideo) {
            const videoTitle = latestVideo[4]; // ช่อง Caption
            const videoCover = latestVideo[2]; // ช่องปก
            const lastNotified = await getLastNotified();

            // ถ้าชื่อคลิปล่าสุด (ตัวล่างสุด) ไม่ตรงกับที่เคยแจ้งไปล่าสุด -> แจ้งเตือน
            if (lastNotified !== videoTitle) {
                self.registration.showNotification("Penguin Zone อัปเดตใหม่!", {
                    body: videoTitle,
                    icon: videoCover || 'https://penguinzone.netlify.app.png',
                    badge: 'https://penguinzone.netlify.app.png',
                    vibrate: [200, 100, 200],
                    tag: 'new-video',
                    data: { url: self.registration.scope }
                });
                await setLastNotified(videoTitle);
            }
        }
    } catch (e) { console.error('Check failed', e); }
}

// พยายามเช็คทุก 1 นาที (หมายเหตุ: มือถือบางรุ่นอาจบล็อกถ้าปิดจอนานๆ)
setInterval(checkUpdates, 60000);

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({type: 'window'}).then( windowClients => {
            for (var i = 0; i < windowClients.length; i++) {
                var client = windowClients[i];
                if (client.url === '/' && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});

// --- Helper Functions ---
function parseCSV(text) {
    const rows=[]; let r=[], c='', q=false;
    for(let i=0;i<text.length;i++){
        let char=text[i], next=text[i+1];
        if(char==='"'){ q && next==='"' ? (c+='"', i++) : q=!q; }
        else if(char===',' && !q){ r.push(c.trim()); c=''; }
        else if((char==='\r'||char==='\n') && !q){ 
            if(char==='\r' && next==='\n') i++; 
            r.push(c.trim()); if(r.length>1) rows.push(r); r=[]; c=''; 
        } else c+=char;
    }
    if(c) r.push(c.trim()); if(r.length>0) rows.push(r);
    return rows;
}

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('PenguinDB', 1);
        request.onupgradeneeded = e => e.target.result.createObjectStore('settings');
        request.onsuccess = e => resolve(e.target.result);
        request.onerror = e => reject(e);
    });
}

async function getNotificationEnabled() {
    const db = await getDB();
    return new Promise(resolve => {
        const transaction = db.transaction(['settings'], 'readonly');
        const request = transaction.objectStore('settings').get('isEnabled');
        request.onsuccess = e => resolve(e.target.result === true);
        request.onerror = () => resolve(false);
    });
}

async function getLastNotified() {
    const db = await getDB();
    return new Promise(resolve => {
        const transaction = db.transaction(['settings'], 'readonly');
        const request = transaction.objectStore('settings').get('lastNotified');
        request.onsuccess = e => resolve(e.target.result);
    });
}

async function setLastNotified(title) {
    const db = await getDB();
    const transaction = db.transaction(['settings'], 'readwrite');
    transaction.objectStore('settings').put(title, 'lastNotified');
}