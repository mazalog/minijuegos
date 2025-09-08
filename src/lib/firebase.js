// Inicialización de Firebase y utilidades de Firestore
// Nota: Este módulo se carga en cliente. Evitar llamar a analytics en SSR.

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCLeLfNNkY4sGinBJE7bY6qP4MFl8Ai63w",
  authDomain: "pegalachapa.firebaseapp.com",
  projectId: "pegalachapa",
  storageBucket: "pegalachapa.firebasestorage.app",
  messagingSenderId: "215961574897",
  appId: "1:215961574897:web:c0fd5e0d286c1f913ab850",
  measurementId: "G-Z3G9N4CZBE",
};

export function getFirebaseApp() {
  try {
    return getApps().length ? getApp() : initializeApp(firebaseConfig);
  } catch (_) {
    return getApp();
  }
}

export function getDb() {
  const app = getFirebaseApp();
  return getFirestore(app);
}

// Lee un documento de Firestore en la colección "transactions" por su ID
export async function fetchTransactionById(transactionId) {
  if (!transactionId) return null;
  try {
    const db = getDb();
    const ref = doc(db, "sales", String(transactionId));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const dateSale = {
      id: snap.id,
      ...snap.data()
    }

    if (dateSale.juiceMinigame) {
      const dateInGameRef = doc(db, "games", String(transactionId));
      const dateInGameSnap = await getDoc(dateInGameRef);
      if (dateInGameSnap.exists()) {
        dateSale.dateInGame = dateInGameSnap.data();
      }
    }

    return {
      ...dateSale,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Firebase fetchTransactionById error", err);
    return null;
  }
}

// agregar los puntos del resultado del juego en un documento de la coleccion games
export async function addGameResult(x) {
  try {
    const db = getDb();
    const ref = doc(db, "games", String(x.saleId));
    await setDoc(ref, x);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Firebase addGameResult error", err);
  }
}

//agregar la propriedad juice minigame a un documento de la coleccion sales
export async function addJuiceMinigame(x) {
  const db = getDb();
  const ref = doc(db, "sales", String(x.saleId));
  await updateDoc(ref, { juiceMinigame: true });
}

