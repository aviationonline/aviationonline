const maxRetries = 10;
async function tryFetch() {
    for (let i=0; i<maxRetries; i++) {
        try {
            const r = await fetch('http://127.0.0.1:3000/api/admin/restore-deleted');
            const data = await r.json();
            console.log("Success:", data);
            return;
        } catch (e) {
            console.log("Failed attempt", i, e.message);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}
tryFetch();
