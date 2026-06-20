import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAoGbY7FR9laLr8Vghuv0ZarKt4X6qMxBo",
  authDomain: "monitorlocal-60bb7.firebaseapp.com",
  projectId: "monitorlocal-60bb7",
  storageBucket: "monitorlocal-60bb7.firebasestorage.app",
  messagingSenderId: "912702134524",
  appId: "1:912702134524:web:ad4c9826e110ae52fc1f79",
  measurementId: "G-K60GH6BJGR"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
