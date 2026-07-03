const https = require('https');

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log("Fetching registry from REST API...");
  const registry = await get("https://firestore.googleapis.com/v1/projects/cashshams/databases/(default)/documents/nadtally_live_registry");
  console.log("Registry Response:", JSON.stringify(registry, null, 2));

  if (registry.documents && registry.documents.length > 0) {
    const firstCompanyPath = registry.documents[0].name; // e.g. "projects/cashshams/databases/(default)/documents/nadtally_live_registry/COMPANY_ID"
    const companyId = firstCompanyPath.split('/').pop();
    console.log(`\nFetching sample records for company: ${companyId}`);
    
    // Query documents in companies_live/COMPANY_ID/records
    const url = `https://firestore.googleapis.com/v1/projects/cashshams/databases/(default)/documents/companies_live/${companyId}/records?pageSize=30`;
    const records = await get(url);
    
    if (records.documents) {
      const collections = new Set();
      const samples = {};
      records.documents.forEach(doc => {
        const fields = doc.fields || {};
        const colName = fields.collectionName?.stringValue || "unknown";
        collections.add(colName);
        if (!samples[colName]) {
          samples[colName] = doc;
        }
      });
      console.log("Collections found:", Array.from(collections));
      console.log("\nSamples:");
      for (const [col, doc] of Object.entries(samples)) {
        console.log(`\n--- Collection: ${col} ---`);
        console.log(JSON.stringify(doc, null, 2));
      }
    } else {
      console.log("No records found or error:", records);
    }
  }
}

run().catch(console.error);
