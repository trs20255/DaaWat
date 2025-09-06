// main.js - Your new primary script

// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDDJ9kFtxZMJnI86_Il9ONDTvA-4tjLfZY",
  authDomain: "unifoods-18311.firebaseapp.com",
  projectId: "unifoods-18311",
  storageBucket: "unifoods-18311.firebasestorage.app",
  messagingSenderId: "1026250402862",
  appId: "1:1026250402862:web:a8a1526a162c682196c3bf",
  measurementId: "G-3RYMPMMES6"
};


firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- GLOBAL STATE ---
let currentUser = null;
let siteSettings = {};

// --- UI REFERENCES ---
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const mainContent = document.getElementById('main-content');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');

// --- LOADER & AUTH LOGIC ---

// This function dynamically loads a script file
function loadScript(src, callback) {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = () => {
        console.log(`${src} loaded successfully.`);
        if (callback) callback();
    };
    script.onerror = () => console.error(`Error loading script: ${src}`);
    document.head.appendChild(script);
}

// Main app initialization
async function initializeApp() {
    const settingsDoc = await db.collection('settings').doc('config').get();
    if (settingsDoc.exists) siteSettings = settingsDoc.data();
    
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                currentUser = { uid: user.uid, ...userDoc.data() };
                userInfo.innerHTML = `<p class="font-semibold">${currentUser.name}</p><p class="text-xs text-gray-500 capitalize">${currentUser.role}</p>`;
                showView('app');
                
                // Dynamically load the correct panel based on user role
                switch (currentUser.role) {
                    case 'customer':
                        loadScript('customer_panel.js', () => initializeCustomerPortal(db, currentUser, siteSettings));
                        break;
                    case 'delivery':
                        loadScript('delivery_panel.js', () => initializeDeliveryPortal(db, currentUser, siteSettings));
                        break;
                    case 'admin':
                    case 'superadmin':
                        loadScript('admin_panel.js', () => initializeAdminPortal(db, currentUser, siteSettings));
                        break;
                    default:
                        mainContent.innerHTML = `<p>Error: Unknown user role.</p>`;
                }
            }
        } else {
            currentUser = null;
            mainContent.innerHTML = ''; // Clear content on logout
            showView('auth');
        }
    });
}

function showView(view) {
    const header = document.querySelector('header');
    if (view === 'app') {
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        header.style.display = 'flex';
    } else {
        appContainer.style.display = 'none';
        header.style.display = 'none';
        authContainer.style.display = 'flex';
        renderAuthForm();
    }
}

function renderAuthForm() {
    const authCard = authContainer.querySelector('.auth-card');
    const template = document.getElementById('login-form-template');
    if (template) {
        authCard.innerHTML = '';
        authCard.appendChild(template.content.cloneNode(true));
        document.getElementById('login-form').addEventListener('submit', handleLogin);
    }
}

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';
    auth.signInWithEmailAndPassword(email, password)
        .catch(err => { errorEl.textContent = err.message; });
}

// --- INITIALIZE ---
document.addEventListener('DOMContentLoaded', initializeApp);
logoutBtn.addEventListener('click', () => auth.signOut());