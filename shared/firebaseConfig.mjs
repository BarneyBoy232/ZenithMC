// firebaseConfig.mjs — public Firebase web config for the ZenithURL project.
// These values are safe to ship client-side (that's what apiKey is for); access is
// controlled by Firestore security rules, not by hiding this.

export const firebaseConfig = {
  apiKey: 'AIzaSyCqc2f3mxV9tIqaSimur4mGOsHIxsWNN8A',
  authDomain: 'zenithurl-e9909.firebaseapp.com',
  projectId: 'zenithurl-e9909',
  storageBucket: 'zenithurl-e9909.firebasestorage.app',
  messagingSenderId: '7083366833',
  appId: '1:7083366833:web:0a4f9837b24de6b1f30590',
  measurementId: 'G-P20NWPE2ZZ',
};

// The Abstrak sub-project (a Firestore collection) that holds all ZenithMC data.
export const SUBPROJECT = 'from_zenithmc';
