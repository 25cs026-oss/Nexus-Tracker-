import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, addDoc, onSnapshot, query, where, orderBy, limit, getDocs, Timestamp, serverTimestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs, 
  Timestamp, 
  serverTimestamp, 
  deleteDoc, 
  writeBatch,
  onAuthStateChanged
};

export const signIn = () => signInWithPopup(auth, googleProvider);
export const signOut = () => auth.signOut();
