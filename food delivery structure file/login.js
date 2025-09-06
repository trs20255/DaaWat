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
let siteSettings = {};

// --- UI REFERENCES ---
const authContainer = document.getElementById('auth-container');

// --- CORE APP LOGIC ---

async function initializeLogin() {
    // Fetch site settings to apply branding
    const settingsDoc = await db.collection('settings').doc('config').get();
    if (settingsDoc.exists) {
        siteSettings = settingsDoc.data();
    }
    
    // Check if a user is already logged in
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            // If user is logged in, redirect them immediately
            redirectUser(user.uid);
        } else {
            // If no user, render the login form
            renderAuthForm('login');
            applySiteSettings();
        }
    });
}

function renderAuthForm(formType) {
    const authCard = authContainer.querySelector('.auth-card');
    authCard.innerHTML = '';
    const template = document.getElementById(`${formType}-form-template`);
    if (template) {
        authCard.appendChild(template.content.cloneNode(true));
    }

    if (formType === 'login') {
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('show-signup-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthForm('signup'); });
       // --- FINAL PASSWORD TOGGLE LOGIC ---
        const passwordInput = document.getElementById('password');
        const toggleButton = document.getElementById('toggle-password-visibility');
        const eyeIcon = toggleButton.querySelector('.eye-icon');
        const eyeOffIcon = toggleButton.querySelector('.eye-off-icon');

        toggleButton.addEventListener('click', () => {
            // Check the current type of the input
            const isPassword = passwordInput.type === 'password';
            
            // Set the new type
            passwordInput.type = isPassword ? 'text' : 'password';
            
            // Toggle the 'hidden' class on both icons
            eyeIcon.classList.toggle('hidden');
            eyeOffIcon.classList.toggle('hidden');
        });
        // --- END OF LOGIC ---

    } else {
        document.getElementById('signup-form').addEventListener('submit', handleSignup);
        document.getElementById('show-login-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthForm('login'); });
        // --- NEW SIGNUP PASSWORD TOGGLE LOGIC ---
        const signupPasswordInput = document.getElementById('signup-password');
        const signupToggleButton = document.getElementById('toggle-signup-password-visibility');
        const signupEyeIcon = signupToggleButton.querySelector('.eye-icon');
        const signupEyeOffIcon = signupToggleButton.querySelector('.eye-off-icon');

        signupToggleButton.addEventListener('click', () => {
            const isPassword = signupPasswordInput.type === 'password';
            signupPasswordInput.type = isPassword ? 'text' : 'password';
            signupEyeIcon.classList.toggle('hidden');
            signupEyeOffIcon.classList.toggle('hidden');
        });
        // --- END OF NEW LOGIC ---
    }
    // Apply settings after form is rendered
    
}function applySiteSettings() {
    // Safely access the nested theme object
    const theme = siteSettings.theme || {};
    const globalTheme = theme.global || {};

    const logoEl = document.getElementById('website-logo-header');
    const nameEl = document.getElementById('website-name-header');
    const logoElSignup = document.getElementById('website-logo-header-signup');
    const nameElSignup = document.getElementById('website-name-header-signup');
    const authContainerBg = document.getElementById('auth-container');

    if (siteSettings.websiteName) {
        if (nameEl) nameEl.textContent = siteSettings.websiteName;
        if (nameElSignup) nameElSignup.textContent = siteSettings.websiteName;
        document.title = siteSettings.websiteName + " - Login";
    }
    if (siteSettings.logoUrl) {
        if (logoEl) logoEl.src = siteSettings.logoUrl;
        if (logoElSignup) logoElSignup.src = siteSettings.logoUrl;
    }

    // Read colors from the correct nested globalTheme object
    document.documentElement.style.setProperty('--primary-color', globalTheme.primaryColor || '#1a202c');
    document.documentElement.style.setProperty('--secondary-color', globalTheme.secondaryColor || '#D4AF37');
    
    if (siteSettings.heroBgImage) {
        authContainerBg.style.backgroundImage = `url('${siteSettings.heroBgImage}')`;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const rememberMe = document.getElementById('remember-me').checked;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    const persistence = rememberMe 
        ? firebase.auth.Auth.Persistence.LOCAL 
        : firebase.auth.Auth.Persistence.SESSION;

    try {
        await auth.setPersistence(persistence);
        await auth.signInWithEmailAndPassword(email, password);
        // The onAuthStateChanged listener will handle the redirect
    } catch (err) {
        if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            errorEl.textContent = 'Invalid username or password. Please try again.';
        } else {
            console.error("Login Error:", err);
            errorEl.textContent = 'An error occurred. Please try again later.';
        }
    }
}


function handleSignup(e) {
    e.preventDefault();
    const errorEl = document.getElementById('signup-error');
    errorEl.textContent = '';
    const userData = {
        name: document.getElementById('signup-name').value,
        mobile: document.getElementById('signup-mobile').value,
        email: document.getElementById('signup-email').value,
        role: 'customer', // Default role for new signups
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const password = document.getElementById('signup-password').value;

    // Basic validation
    if (!userData.name || !userData.email || password.length < 6) {
        errorEl.textContent = "Please fill all fields. Password must be at least 6 characters.";
        return;
    }

    auth.createUserWithEmailAndPassword(userData.email, password)
        .then(cred => {
            // After creating the user in Auth, save their details in Firestore
            return db.collection('users').doc(cred.user.uid).set(userData);
        })
        .catch(err => {
            errorEl.textContent = err.message;
        });
}

async function redirectUser(userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
        const userRole = userDoc.data().role;
        // Redirect based on role
        switch (userRole) {
            case 'superadmin':
                window.location.href = 'superadmin_panel.html';
                break;
            case 'admin':
                // Assuming you have an admin.html
                window.location.href = 'admin_panel.html';
                break;
            case 'restaurant':
                 // Assuming you have a restaurant.html
                window.location.href = 'restaurant_panel.html';
                break;
            case 'delivery':
                 // Assuming you have a delivery.html
                window.location.href = 'delivery_panel.html';
                break;
            case 'customer':
            default:
                 // Assuming you have a customer.html
                window.location.href = 'customer_Panel.html';
                break;
        }
    } else {
        // Handle case where user exists in Auth but not in Firestore
        console.error("User data not found in Firestore. Logging out.");
        auth.signOut();
    }
}

function applySiteSettings() {
    const logoEl = document.getElementById('website-logo-header');
    const nameEl = document.getElementById('website-name-header');
    const logoElSignup = document.getElementById('website-logo-header-signup');
    const nameElSignup = document.getElementById('website-name-header-signup');
    const authContainerBg = document.getElementById('auth-container');

    if (siteSettings.websiteName) {
        if (nameEl) nameEl.textContent = siteSettings.websiteName;
        if (nameElSignup) nameElSignup.textContent = siteSettings.websiteName;
        document.title = siteSettings.websiteName + " - Login";
    }
    if (siteSettings.logoUrl) {
        if (logoEl) logoEl.src = siteSettings.logoUrl;
        if (logoElSignup) logoElSignup.src = siteSettings.logoUrl;
    }
    if (siteSettings.primaryColor) {
        document.documentElement.style.setProperty('--primary-color', siteSettings.primaryColor);
    }
    if (siteSettings.secondaryColor) {
        document.documentElement.style.setProperty('--secondary-color', siteSettings.secondaryColor);
    }
    if (siteSettings.heroBgImage) {
        authContainerBg.style.backgroundImage = `url('${siteSettings.heroBgImage}')`;
    }
}

// --- INITIALIZE APP ON LOAD ---
document.addEventListener('DOMContentLoaded', initializeLogin);