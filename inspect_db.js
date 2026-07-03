import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, query } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDaKgWXJiz_NTYo4NBCXhVZ7qIo9SwkooY",
  authDomain: "cashshams.firebaseapp.com",
  projectId: "cashshams",
  storageBucket: "cashshams.firebasestorage.app",
  messagingSenderId: "565173718396",
  appId: "1:565173718396:web:c23d370ab7c629f86c28f9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspect() {
  console.log("Scanning nadtally_live_registry...");
  const registrySnap = await getDocs(collection(db, "nadtally_live_registry"));
  const companies = [];
  registrySnap.forEach(doc => {
    console.log(`Company ID: ${doc.id}, Name: ${doc.data().name}, Stats:`, doc.data().stats);
    companies.push(doc.id);
  });

  if (companies.length > 0) {
    const firstCompany = companies[0];
    console.log(`\nInspecting records for company: ${firstCompany}`);
    const recordsRef = collection(db, `companies_live/${firstCompany}/records`);
    const q = query(recordsRef, limit(100));
    const recordsSnap = await getDocs(q);
    const collections = new Set();
    const samples = {};
    
    recordsSnap.forEach(doc => {
      const data = doc.data();
      const colName = data.collectionName || "unknown";
      collections.add(colName);
      if (!samples[colName]) {
        samples[colName] = data;
      }
    });

    console.log("Unique collectionName values found in first 100 records:", Array.from(collections));
    console.log("\nSamples:");
    for (const [col, sample] of Object.entries(samples)) {
      console.log(`\n--- Collection: ${col} ---`);
      console.log(JSON.stringify(sample, null, 2));
    }
  }
}

inspect().catch(console.error);
