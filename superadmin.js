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

// --- GLOBAL STATE & EVENT HANDLERS ---
let currentUser = null;
let unsubscribeListeners = [];
let activePortalHandler = null;
let siteSettings = {};

// --- UI REFERENCES ---
const mainContent = document.getElementById('main-content');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const modalContainer = document.getElementById('modal-container');
const websiteNameHeader = document.getElementById('website-name-header');
const websiteLogoHeader = document.getElementById('website-logo-header');

// --- CORE APP & AUTH LOGIC ---
async function initializeApp() {
    // Fetch site settings to apply branding and check for maintenance mode
    const settingsDoc = await db.collection('settings').doc('config').get();
    if (settingsDoc.exists) {
        siteSettings = settingsDoc.data();
    }
    applySiteSettings();

    // Listen for changes in authentication state
    auth.onAuthStateChanged(async (user) => {
        cleanupListeners(); // Clear any existing database listeners
        
        if (user) {
            const userDoc = await db.collection('users').doc(user.uid).get();
            // Ensure the logged-in user is a superadmin
            if (userDoc.exists && userDoc.data().role === 'superadmin') {
                currentUser = { uid: user.uid, ...userDoc.data() };
                userInfo.innerHTML = `<p class="font-semibold">${currentUser.name}</p><p class="text-xs text-gray-500 capitalize">${currentUser.role}</p>`;
                // Start the superadmin portal logic
                initializeSuperAdminPortal();
            } else {
                // If not a superadmin, redirect to login
                window.location.href = 'login.html';
            }
        } else {
            // If no user is logged in, redirect to login
            window.location.href = 'login.html';
        }
    });
}

// --- SUPER ADMIN PORTAL ---
function initializeSuperAdminPortal() {
    activePortalHandler = handleSuperAdminClicks;
    mainContent.addEventListener('click', activePortalHandler);
    renderSuperAdminView('dashboard');
}

function handleSuperAdminClicks(e) {
    const sidebarLink = e.target.closest('.sidebar-link');
    if (sidebarLink) {
        renderSuperAdminView(sidebarLink.dataset.view);
        return;
    }
}

function renderSuperAdminView(viewName) {
    const nav = document.getElementById('superadmin-nav');
    if (nav) {
        nav.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
        const activeLink = nav.querySelector(`[data-view="${viewName}"]`);
        if (activeLink) activeLink.classList.add('active');
    }
    const contentArea = document.getElementById('superadmin-main-content');
    if (!contentArea) return;

    switch(viewName) {
        case 'dashboard': renderPlatformDashboard(contentArea); break;
        case 'analytics': renderSuperAdminAnalytics(contentArea); break;
        case 'website-settings': renderThemeSettingsView(contentArea); break;
        case 'financial-settings': renderFinancialSettingsView(contentArea); break;
        case 'hero-content': renderHeroContentView(contentArea); break;
        case 'announcements': renderAnnouncementsView(contentArea); break;
        case 'cuisine-management': renderCuisineManagementView(contentArea); break;
        case 'feature-flags': renderFeatureFlagsView(contentArea); break;
        case 'legal-editor': renderLegalEditorView(contentArea); break;
        case 'revenue-report': renderRevenueReportView(contentArea); break;
        case 'promotions': renderPromotionsView(contentArea); break;
        case 'restaurant-payouts': renderRestaurantPayoutsView(contentArea); break;
        case 'delivery-earnings': renderAllDeliveryEarningsView(contentArea); break;
        case 'user-roles': renderUserRolesView(contentArea); break;
        case 'audit-log': renderAuditLogView(contentArea); break;
        case 'broadcast-message': renderBroadcastMessageView(contentArea); break;
        case 'system-health': renderSystemHealthView(contentArea); break;
        case 'api-keys': renderApiKeysView(contentArea); break;
        case 'maintenance-mode': renderMaintenanceModeView(contentArea); break;
        case 'support-tickets': renderSupportTicketsView(contentArea); break;
        case 'user-feedback': renderAllReviewsView(contentArea); break;
        case 'ip-blacklist': renderIpBlacklistView(contentArea); break;
    }
}

// --- VIEW RENDERING FUNCTIONS ---

async function renderPlatformDashboard(contentArea) {
     contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Platform Dashboard</h2><p>Loading stats...</p>`;
     const [ordersSnapshot, usersSnapshot, restaurantsSnapshot] = await Promise.all([
         db.collection('orders').get(),
         db.collection('users').get(),
         db.collection('restaurants').get()
     ]);

     const totalRevenue = ordersSnapshot.docs.reduce((sum, doc) => sum + (doc.data().totalPrice || 0), 0);
     contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Platform Dashboard</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="bg-white p-6 rounded-xl shadow-md text-center"><h4 class="text-lg font-semibold text-gray-500">Total Revenue</h4><p class="text-3xl font-bold mt-2">₹${totalRevenue.toFixed(2)}</p></div>
            <div class="bg-white p-6 rounded-xl shadow-md text-center"><h4 class="text-lg font-semibold text-gray-500">Total Orders</h4><p class="text-3xl font-bold mt-2">${ordersSnapshot.size}</p></div>
            <div class="bg-white p-6 rounded-xl shadow-md text-center"><h4 class="text-lg font-semibold text-gray-500">Total Users</h4><p class="text-3xl font-bold mt-2">${usersSnapshot.size}</p></div>
            <div class="bg-white p-6 rounded-xl shadow-md text-center"><h4 class="text-lg font-semibold text-gray-500">Total Restaurants</h4><p class="text-3xl font-bold mt-2">${restaurantsSnapshot.size}</p></div>
        </div>
     `;
     feather.replace();
}

async function renderSuperAdminAnalytics(contentArea) {
     contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Advanced Analytics</h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-6 rounded-xl shadow-md"><canvas id="ordersChart"></canvas></div>
            <div class="bg-white p-6 rounded-xl shadow-md"><canvas id="usersChart"></canvas></div>
        </div>
    `;
    const ordersSnapshot = await db.collection('orders').get();
    const usersSnapshot = await db.collection('users').get();

    const ordersByMonth = ordersSnapshot.docs.reduce((acc, doc) => {
        const month = new Date(doc.data().createdAt.seconds * 1000).toLocaleString('default', { month: 'short' });
        acc[month] = (acc[month] || 0) + 1;
        return acc;
    }, {});
    new Chart(document.getElementById('ordersChart'), {
        type: 'line',
        data: {
            labels: Object.keys(ordersByMonth),
            datasets: [{ label: 'Orders per Month', data: Object.values(ordersByMonth), tension: 0.1, backgroundColor: 'rgba(212, 175, 55, 0.2)', borderColor: 'rgba(212, 175, 55, 1)' }]
        }
    });

    const usersByRole = usersSnapshot.docs.reduce((acc, doc) => {
        const role = doc.data().role;
        acc[role] = (acc[role] || 0) + 1;
        return acc;
    }, {});
     new Chart(document.getElementById('usersChart'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(usersByRole),
            datasets: [{ label: 'Users by Role', data: Object.values(usersByRole), backgroundColor: ['#1a202c', '#D4AF37', '#E53935', '#4A5568', '#9CA3AF'] }]
        }
    });
}

async function renderThemeSettingsView(contentArea) {
    const theme = siteSettings.theme || {};
    const globalTheme = theme.global || {};

    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Theme & Branding</h2>
        <form id="theme-settings-form" class="space-y-8">
            
            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-2xl font-serif font-bold mb-4 border-b pb-2">Basic Branding</h3>
                <div class="space-y-4">
                    <div>
                        <label for="website-name" class="block text-sm font-medium text-gray-700">Website Name</label>
                        <input type="text" id="website-name" name="websiteName" class="input-field mt-1 block w-full" value="${siteSettings.websiteName || ''}">
                    </div>
                    <div>
                        <label for="website-logo" class="block text-sm font-medium text-gray-700">Logo URL</label>
                        <input type="url" id="website-logo" name="logoUrl" class="input-field mt-1 block w-full" value="${siteSettings.logoUrl || ''}">
                    </div>
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-2xl font-serif font-bold mb-4 border-b pb-2">Color Palette</h3>
                 <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label for="primary-color" class="block text-sm font-medium text-gray-700">Primary Color</label>
                        <input type="color" id="primary-color" name="primaryColor" class="input-field mt-1 h-12 block w-full" value="${globalTheme.primaryColor || '#1a202c'}">
                    </div>
                    <div>
                        <label for="secondary-color" class="block text-sm font-medium text-gray-700">Secondary Color</label>
                        <input type="color" id="secondary-color" name="secondaryColor" class="input-field mt-1 h-12 block w-full" value="${globalTheme.secondaryColor || '#D4AF37'}">
                    </div>
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-2xl font-serif font-bold mb-4 border-b pb-2">Gradient Background (for Header)</h3>
                <div class="space-y-4">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" name="useGradient" class="h-5 w-5 rounded" ${globalTheme.useGradient ? 'checked' : ''}>
                        <span class="font-medium">Enable Gradient Background</span>
                    </label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label for="gradient-start" class="block text-sm font-medium text-gray-700">Gradient Start</label>
                            <input type="color" id="gradient-start" name="gradientStart" class="input-field mt-1 h-12 block w-full" value="${globalTheme.gradientStart || '#4c51bf'}">
                        </div>
                        <div>
                            <label for="gradient-end" class="block text-sm font-medium text-gray-700">Gradient End</label>
                            <input type="color" id="gradient-end" name="gradientEnd" class="input-field mt-1 h-12 block w-full" value="${globalTheme.gradientEnd || '#6b46c1'}">
                        </div>
                    </div>
                </div>
            </div>

            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="text-2xl font-serif font-bold mb-4 border-b pb-2">Advanced Color Settings</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label for="bg-color" class="block text-sm font-medium text-gray-700">Page Background</label>
                        <input type="color" id="bg-color" name="backgroundColor" class="input-field mt-1 h-12 block w-full" value="${globalTheme.backgroundColor || '#F8F9FA'}">
                    </div>
                    <div>
                        <label for="text-color" class="block text-sm font-medium text-gray-700">Primary Text</label>
                        <input type="color" id="text-color" name="textColor" class="input-field mt-1 h-12 block w-full" value="${globalTheme.textColor || '#1f2937'}">
                    </div>
                    <div>
                        <label for="btn-text-color" class="block text-sm font-medium text-gray-700">Button Text</label>
                        <input type="color" id="btn-text-color" name="buttonTextColor" class="input-field mt-1 h-12 block w-full" value="${globalTheme.buttonTextColor || '#FFFFFF'}">
                    </div>
                </div>
            </div>

            <button type="submit" class="btn btn-primary w-full py-3 rounded-lg text-lg font-bold">Save All Settings</button>
        </form>
    `;
    document.getElementById('theme-settings-form').addEventListener('submit', handleUpdateThemeSettings);
}

async function handleUpdateThemeSettings(e) {
    e.preventDefault();
    const form = e.target;
    const updatedSettings = {
        websiteName: form.elements.websiteName.value,
        logoUrl: form.elements.logoUrl.value,
        theme: {
            global: {
                primaryColor: form.elements.primaryColor.value,
                secondaryColor: form.elements.secondaryColor.value,
                useGradient: form.elements.useGradient.checked,
                gradientStart: form.elements.gradientStart.value,
                gradientEnd: form.elements.gradientEnd.value,
                backgroundColor: form.elements.backgroundColor.value,
                textColor: form.elements.textColor.value,
                buttonTextColor: form.elements.buttonTextColor.value,
            }
        }
    };
    await db.collection('settings').doc('config').set(updatedSettings, { merge: true });
    await logAudit("Theme & Branding Updated", JSON.stringify(updatedSettings));
    siteSettings = {...siteSettings, ...updatedSettings};
    applySiteSettings();
    showSimpleModal('Success', 'Theme and branding settings updated successfully!');
}

async function renderHeroContentView(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Login Page Hero</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <form id="hero-content-form" class="space-y-4">
                <div>
                    <label for="hero-title" class="block text-sm font-medium text-gray-700">Hero Title</label>
                    <input type="text" name="heroTitle" class="input-field w-full" value="${siteSettings.heroTitle || ''}">
                </div>
                <div>
                    <label for="hero-subtitle" class="block text-sm font-medium text-gray-700">Hero Subtitle</label>
                    <input type="text" name="heroSubtitle" class="input-field w-full" value="${siteSettings.heroSubtitle || ''}">
                </div>
                 <div>
                    <label for="hero-bg" class="block text-sm font-medium text-gray-700">Background Image URL</label>
                    <input type="url" name="heroBgImage" class="input-field w-full" value="${siteSettings.heroBgImage || ''}">
                </div>
                <button type="submit" class="btn btn-primary">Save Hero Content</button>
            </form>
        </div>`;
    document.getElementById('hero-content-form').addEventListener('submit', async (e) => {
         e.preventDefault();
         const form = e.target;
         const updatedSettings = {
            heroTitle: form.elements.heroTitle.value,
            heroSubtitle: form.elements.heroSubtitle.value,
            heroBgImage: form.elements.heroBgImage.value
         };
         await db.collection('settings').doc('config').set(updatedSettings, { merge: true });
         await logAudit("Hero Content Updated", ``);
         siteSettings = {...siteSettings, ...updatedSettings};
         applySiteSettings();
         showSimpleModal('Success', 'Hero content updated!');
    });
}

async function renderAnnouncementsView(contentArea) {
    contentArea.innerHTML = `
        <div class="flex justify-between items-center mb-6">
             <h2 class="text-3xl font-bold font-serif">Announcements</h2>
             <button id="add-announcement-btn" class="btn btn-primary">Add New</button>
        </div>
        <div id="announcements-list" class="space-y-3"></div>`;

    const listEl = document.getElementById('announcements-list');
    const unsub = db.collection('announcements').onSnapshot(snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No announcements found.</p>';
            return;
        }
        listEl.innerHTML = snapshot.docs.map(doc => {
            const a = doc.data();
            return `<div class="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center">
                        <div>
                            <p class="font-bold">${a.title}</p>
                            <p class="text-sm text-gray-600">${a.text}</p>
                            <p class="text-xs font-semibold ${a.isActive ? 'text-green-600' : 'text-gray-500'}">${a.isActive ? 'ACTIVE' : 'INACTIVE'}</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="handleEditAnnouncement('${doc.id}')" class="btn bg-gray-200 p-2"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                            <button onclick="handleDeleteAnnouncement('${doc.id}')" class="btn btn-danger p-2"><i data-feather="trash" class="w-4 h-4"></i></button>
                        </div>
                    </div>`;
        }).join('');
        feather.replace();
    });
    unsubscribeListeners.push(unsub);

    document.getElementById('add-announcement-btn').addEventListener('click', () => handleEditAnnouncement(null));
}

async function handleEditAnnouncement(id) {
    const isEditing = id !== null;
    let announcement = { title: '', text: '', isActive: false };
    if (isEditing) {
        const doc = await db.collection('announcements').doc(id).get();
        if(doc.exists) announcement = doc.data();
    }
    const formHtml = `
        <form id="announcement-form" class="space-y-4">
             <h3 class="text-2xl font-bold font-serif">${isEditing ? 'Edit' : 'Add'} Announcement</h3>
             <input type="text" name="title" class="input-field w-full" placeholder="Title" value="${announcement.title}" required>
             <textarea name="text" class="input-field w-full" rows="3" placeholder="Announcement Text" required>${announcement.text}</textarea>
             <label class="flex items-center gap-2"><input type="checkbox" name="isActive" class="rounded" ${announcement.isActive ? 'checked' : ''}> Make Active</label>
             <button type="submit" class="btn btn-primary w-full">Save</button>
        </form>`;
    showModal(formHtml);
    document.getElementById('announcement-form').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const data = { title: form.elements.title.value, text: form.elements.text.value, isActive: form.elements.isActive.checked };
        if (isEditing) {
            await db.collection('announcements').doc(id).update(data);
        } else {
            await db.collection('announcements').add(data);
        }
        closeModal();
    });
}

function handleDeleteAnnouncement(id) {
    showConfirmationModal("Delete Announcement?", "Are you sure? This cannot be undone.", async () => {
        await db.collection('announcements').doc(id).delete();
    });
}

async function renderUserRolesView(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">User Role Management</h2><div id="user-roles-list">Loading...</div>`;
    const listEl = document.getElementById('user-roles-list');

    db.collection('users').onSnapshot(snapshot => {
        const tableHtml = `
            <div class="bg-white p-4 rounded-xl shadow-md overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th class="px-6 py-3">Name</th><th class="px-6 py-3">Email</th><th class="px-6 py-3">Current Role</th><th class="px-6 py-3">Change Role</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${snapshot.docs.map(doc => {
                            const user = {id: doc.id, ...doc.data()};
                            const isDisabled = user.id === currentUser.uid;
                            return `
                                <tr class="border-b">
                                    <td class="px-6 py-4">${user.name}</td>
                                    <td class="px-6 py-4">${user.email}</td>
                                    <td class="px-6 py-4 capitalize">${user.role}</td>
                                    <td class="px-6 py-4">
                                        <select onchange="handleRoleChange(this, '${user.id}', '${user.role}')" class="role-select input-field rounded-lg" ${isDisabled ? 'disabled' : ''}>
                                            <option value="customer" ${user.role === 'customer' ? 'selected' : ''}>Customer</option>
                                            <option value="restaurant" ${user.role === 'restaurant' ? 'selected' : ''}>Restaurant</option>
                                            <option value="delivery" ${user.role === 'delivery' ? 'selected' : ''}>Delivery</option>
                                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                                            <option value="superadmin" ${user.role === 'superadmin' ? 'selected' : ''}>Superadmin</option>
                                        </select>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
        listEl.innerHTML = tableHtml;
    });
}

function handleRoleChange(selectElement, userId, originalRole) {
    const newRole = selectElement.value;
    showConfirmationModal(
        `Change Role?`,
        `Are you sure you want to change this user's role to ${newRole}?`,
        async () => {
            await db.collection('users').doc(userId).update({ role: newRole });
            await logAudit("User Role Changed", `User ID: ${userId}, New Role: ${newRole}`);
            showSimpleModal('Success', 'Role updated successfully.');
        },
        () => { // onCancel
            selectElement.value = originalRole;
        }
    );
}

async function renderMaintenanceModeView(contentArea) {
    const isMaintenanceEnabled = siteSettings.maintenanceMode || false;
    const maintenanceMessage = siteSettings.maintenanceModeMessage || 'The site is currently down for maintenance. We will be back shortly!';

    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Maintenance Mode</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <form id="maintenance-mode-form" class="space-y-4">
                <div>
                    <p class="font-semibold text-lg">Site Maintenance</p>
                    <p class="text-sm text-gray-600 mb-4">Enabling this makes the site inaccessible to all users except superadmins.</p>
                </div>
                <div>
                    <label for="maintenance-message" class="block text-sm font-medium text-gray-700">Custom Maintenance Message</label>
                    <textarea id="maintenance-message" name="maintenanceMessage" class="input-field w-full mt-1" rows="4">${maintenanceMessage}</textarea>
                </div>
                <button type="submit" class="w-full py-3 rounded-lg text-lg font-bold btn ${isMaintenanceEnabled ? 'btn-secondary' : 'btn-danger'}">
                    ${isMaintenanceEnabled ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
                </button>
            </form>
        </div>
        
        <div class="bg-white p-6 rounded-xl shadow-md mt-8">
            <form id="admin-maintenance-mode-form">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="font-semibold text-lg">Admin Panel Maintenance</p>
                        <p class="text-sm text-gray-600">Blocks access for 'admin' users, but not 'superadmin' users.</p>
                    </div>
                    <button type="submit" class="btn ${siteSettings.adminMaintenanceMode ? 'btn-danger' : 'btn-secondary'} w-48">
                        ${siteSettings.adminMaintenanceMode ? 'Disable' : 'Enable'}
                    </button>
                </div>
            </form>
        </div>
    `;
    document.getElementById('maintenance-mode-form').addEventListener('submit', handleToggleMaintenanceMode);
    document.getElementById('admin-maintenance-mode-form').addEventListener('submit', handleToggleAdminMaintenanceMode);
}


async function handleToggleMaintenanceMode(e) {
    e.preventDefault();
    const newStatus = !siteSettings.maintenanceMode;
    const message = e.target.elements.maintenanceMessage.value;

    await db.collection('settings').doc('config').update({ 
        maintenanceMode: newStatus,
        maintenanceModeMessage: message
    });
    await logAudit(`Maintenance Mode ${newStatus ? 'Enabled' : 'Disabled'}`, `Message: ${message}`);
    siteSettings.maintenanceMode = newStatus;
    siteSettings.maintenanceModeMessage = message;

    showSimpleModal(
        `Maintenance Mode ${newStatus ? 'Enabled' : 'Disabled'}`,
        'The site status has been updated.',
        () => { renderMaintenanceModeView(document.getElementById('superadmin-main-content')); }
    );
}

async function handleToggleAdminMaintenanceMode(e) {
    e.preventDefault();
    const newStatus = !siteSettings.adminMaintenanceMode;
    await db.collection('settings').doc('config').update({ adminMaintenanceMode: newStatus });
    await logAudit(`Admin Maintenance Mode ${newStatus ? 'Enabled' : 'Disabled'}`, ``);
    siteSettings.adminMaintenanceMode = newStatus;
    showSimpleModal(
        `Admin Maintenance ${newStatus ? 'Enabled' : 'Disabled'}`,
        'The admin panel status has been updated.',
        () => { renderMaintenanceModeView(document.getElementById('superadmin-main-content')); }
    );
}


async function renderAuditLogView(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Audit Log</h2><div id="audit-log-list">Loading...</div>`;
    const snapshot = await db.collection('auditLog').orderBy('timestamp', 'desc').limit(50).get();
    const logHtml = snapshot.docs.map(doc => {
        const log = doc.data();
        return `<div class="bg-white p-3 rounded-lg text-sm mb-2">
            <p><strong>Action:</strong> ${log.action}</p>
            <p><strong>By:</strong> ${log.performedBy} (${log.role})</p>
            <p class="text-xs text-gray-500">${new Date(log.timestamp.seconds * 1000).toLocaleString()}</p>
            <p class="font-mono text-xs mt-1 bg-gray-100 p-1 rounded">${log.details}</p>
        </div>`
    }).join('');
    document.getElementById('audit-log-list').innerHTML = logHtml;
}

async function renderFinancialSettingsView(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Financial Settings</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <form id="financial-settings-form" class="space-y-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Delivery Charge</label>
                    <div class="flex items-center gap-2 mt-1">
                        <input type="number" name="deliveryCharge" class="input-field w-full" value="${siteSettings.deliveryCharge || 0}" required>
                        <select name="deliveryChargeType" class="input-field">
                            <option value="fixed" ${siteSettings.deliveryChargeType === 'fixed' ? 'selected' : ''}>Fixed (₹)</option>
                            <option value="percentage" ${siteSettings.deliveryChargeType === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
                        </select>
                    </div>
                </div>
                <div>
                    <label for="gst-rate" class="block text-sm font-medium text-gray-700">GST Rate (%)</label>
                    <input type="number" id="gst-rate" name="gstRate" class="input-field mt-1 block w-full" value="${siteSettings.gstRate || 5}" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Platform Fee</label>
                    <div class="flex items-center gap-2 mt-1">
                        <input type="number" name="platformFee" class="input-field w-full" value="${siteSettings.platformFee || 0}" required>
                        <select name="platformFeeType" class="input-field">
                            <option value="fixed" ${siteSettings.platformFeeType === 'fixed' ? 'selected' : ''}>Fixed (₹)</option>
                            <option value="percentage" ${siteSettings.platformFeeType === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
                        </select>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary w-full py-3 rounded-lg">Save Financial Settings</button>
            </form>
        </div>
    `;
    document.getElementById('financial-settings-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const updatedSettings = {
            deliveryCharge: parseFloat(form.elements.deliveryCharge.value),
            deliveryChargeType: form.elements.deliveryChargeType.value,
            gstRate: parseFloat(form.elements.gstRate.value),
            platformFee: parseFloat(form.elements.platformFee.value),
            platformFeeType: form.elements.platformFeeType.value,
        };
        await db.collection('settings').doc('config').set(updatedSettings, { merge: true });
        await logAudit("Financial Settings Updated", JSON.stringify(updatedSettings));
        siteSettings = {...siteSettings, ...updatedSettings};
        showSimpleModal('Success', 'Financial settings updated successfully!');
    });
}

async function renderCuisineManagementView(contentArea) {
    contentArea.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold font-serif">Cuisine Categories</h2>
            <button id="add-cuisine-btn" class="btn btn-primary">Add New Cuisine</button>
        </div>
        <div id="cuisine-list" class="space-y-3"></div>
    `;
    const listEl = document.getElementById('cuisine-list');
    const unsub = db.collection('cuisineCategories').onSnapshot(snapshot => {
        if(snapshot.empty) {
            listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No cuisine categories found.</p>';
            return;
        }
        listEl.innerHTML = snapshot.docs.map(doc => {
            const cuisine = doc.data();
            return `<div class="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center">
                        <p class="font-semibold">${cuisine.name}</p>
                        <div class="flex gap-2">
                            <button onclick="showCuisineForm('${doc.id}')" class="btn bg-gray-200 p-2"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                            <button onclick="deleteCuisine('${doc.id}')" class="btn btn-danger p-2"><i data-feather="trash" class="w-4 h-4"></i></button>
                        </div>
                    </div>`;
        }).join('');
        feather.replace();
    });
    unsubscribeListeners.push(unsub);
    document.getElementById('add-cuisine-btn').addEventListener('click', () => showCuisineForm());
}

async function showCuisineForm(id = null) {
    let name = '';
    if (id) {
        const doc = await db.collection('cuisineCategories').doc(id).get();
        name = doc.data().name;
    }
    const formHtml = `
        <form id="cuisine-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif">${id ? 'Edit' : 'Add'} Cuisine</h3>
            <input type="text" name="name" class="input-field w-full" placeholder="Cuisine Name (e.g., Italian)" value="${name}" required>
            <button type="submit" class="btn btn-primary w-full">Save</button>
        </form>
    `;
    showModal(formHtml);
    document.getElementById('cuisine-form').addEventListener('submit', async e => {
        e.preventDefault();
        const newName = e.target.elements.name.value;
        if (id) {
            await db.collection('cuisineCategories').doc(id).update({ name: newName });
            await logAudit('Cuisine Updated', `ID: ${id}, Name: ${newName}`);
        } else {
            const docRef = await db.collection('cuisineCategories').add({ name: newName });
            await logAudit('Cuisine Added', `ID: ${docRef.id}, Name: ${newName}`);
        }
        closeModal();
    });
}

function deleteCuisine(id) {
    showConfirmationModal('Delete Cuisine?', 'Are you sure? This cannot be undone.', async () => {
        await db.collection('cuisineCategories').doc(id).delete();
        await logAudit('Cuisine Deleted', `ID: ${id}`);
    });
}

async function renderLegalEditorView(contentArea) {
    const legalDoc = await db.collection('settings').doc('legal').get();
    const legalData = legalDoc.exists ? legalDoc.data() : { terms: '', privacy: '' };
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Legal Page Editor</h2>
        <form id="legal-form" class="bg-white p-6 rounded-xl shadow-md space-y-6">
            <div>
                <label for="terms-editor" class="block text-lg font-semibold mb-2">Terms of Service</label>
                <textarea id="terms-editor" name="terms" class="input-field w-full" rows="15">${legalData.terms}</textarea>
            </div>
            <div>
                <label for="privacy-editor" class="block text-lg font-semibold mb-2">Privacy Policy</label>
                <textarea id="privacy-editor" name="privacy" class="input-field w-full" rows="15">${legalData.privacy}</textarea>
            </div>
            <button type="submit" class="btn btn-primary">Save Legal Content</button>
        </form>
    `;
    document.getElementById('legal-form').addEventListener('submit', async e => {
        e.preventDefault();
        const updatedLegal = {
            terms: e.target.elements.terms.value,
            privacy: e.target.elements.privacy.value
        };
        await db.collection('settings').doc('legal').set(updatedLegal);
        await logAudit("Legal Pages Updated", "");
        showSimpleModal('Success', 'Legal pages have been updated.');
    });
}

async function renderPromotionsView(contentArea) {
     contentArea.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold font-serif">Promotions & Discounts</h2>
            <button id="add-promo-btn" class="btn btn-primary">Create Promo Code</button>
        </div>
        <div id="promo-list" class="space-y-3"></div>
    `;
    const listEl = document.getElementById('promo-list');
    const unsub = db.collection('promotions').onSnapshot(snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No promotions found.</p>';
            return;
        }
        listEl.innerHTML = snapshot.docs.map(doc => {
            const p = doc.data();
            const discount = p.type === 'fixed' ? `₹${p.value}` : `${p.value}%`;
            return `<div class="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center">
                        <div>
                            <p class="font-semibold text-lg font-mono">${p.code}</p>
                            <p class="text-sm text-gray-600">Discount: ${discount}</p>
                            <p class="text-xs font-semibold ${p.isActive ? 'text-green-600' : 'text-gray-500'}">${p.isActive ? 'ACTIVE' : 'INACTIVE'}</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="showPromoForm('${doc.id}')" class="btn bg-gray-200 p-2"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                        </div>
                    </div>`;
        }).join('');
        feather.replace();
    });
    unsubscribeListeners.push(unsub);
    document.getElementById('add-promo-btn').addEventListener('click', () => showPromoForm());
}

async function showPromoForm(id = null) {
    let promo = { code: '', type: 'percentage', value: 10, isActive: true };
    if (id) {
        const doc = await db.collection('promotions').doc(id).get();
        promo = doc.data();
    }
    const formHtml = `
         <form id="promo-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif">${id ? 'Edit' : 'Create'} Promotion</h3>
            <input type="text" name="code" class="input-field w-full" placeholder="Promo Code (e.g., SAVE10)" value="${promo.code}" required>
            <div class="flex items-center gap-2">
                <input type="number" name="value" class="input-field w-full" value="${promo.value}" required>
                <select name="type" class="input-field">
                    <option value="percentage" ${promo.type === 'percentage' ? 'selected' : ''}>Percentage (%)</option>
                    <option value="fixed" ${promo.type === 'fixed' ? 'selected' : ''}>Fixed (₹)</option>
                </select>
            </div>
            <label class="flex items-center gap-2"><input type="checkbox" name="isActive" class="rounded" ${promo.isActive ? 'checked' : ''}> Active</label>
            <button type="submit" class="btn btn-primary w-full">Save Promotion</button>
        </form>
    `;
    showModal(formHtml);
    document.getElementById('promo-form').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const data = {
            code: form.elements.code.value.toUpperCase(),
            type: form.elements.type.value,
            value: parseFloat(form.elements.value.value),
            isActive: form.elements.isActive.checked
        };
        if (id) {
            await db.collection('promotions').doc(id).update(data);
            await logAudit('Promotion Updated', `Code: ${data.code}`);
        } else {
            await db.collection('promotions').add(data);
            await logAudit('Promotion Created', `Code: ${data.code}`);
        }
        closeModal();
    });
}

async function renderFeatureFlagsView(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Feature Flags</h2>
        <div class="bg-white p-6 rounded-xl shadow-md space-y-4" id="feature-flags-list">
            <p>Loading feature flags...</p>
        </div>`;
    const listEl = document.getElementById('feature-flags-list');
    const docRef = db.collection('settings').doc('featureFlags');
    const unsub = docRef.onSnapshot(doc => {
        const flags = doc.exists ? doc.data() : {};
        listEl.innerHTML = `
            <div class="flex items-center justify-between p-3 border rounded-lg">
                <div>
                    <p class="font-semibold">Enable Beta Dashboard</p>
                    <p class="text-sm text-gray-500">Toggles a new experimental dashboard for restaurants.</p>
                </div>
                <input type="checkbox" onchange="toggleFeatureFlag('betaDashboard', this.checked)" class="transform scale-125" ${flags.betaDashboard ? 'checked' : ''}>
            </div>
            <div class="flex items-center justify-between p-3 border rounded-lg">
                <div>
                    <p class="font-semibold">Enable New Checkout Flow</p>
                    <p class="text-sm text-gray-500">Activates a redesigned, single-page checkout process for customers.</p>
                </div>
                <input type="checkbox" onchange="toggleFeatureFlag('newCheckout', this.checked)" class="transform scale-125" ${flags.newCheckout ? 'checked' : ''}>
            </div>
        `;
    });
    unsubscribeListeners.push(unsub);
}

async function toggleFeatureFlag(flagName, isEnabled) {
    await db.collection('settings').doc('featureFlags').set({ [flagName]: isEnabled }, { merge: true });
    await logAudit('Feature Flag Toggled', `${flagName} set to ${isEnabled}`);
}

async function renderRevenueReportView(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Platform Revenue Report</h2><p>Loading report...</p>`;
    const ordersSnapshot = await db.collection('orders').where('status', '==', 'delivered').get();
    const orders = ordersSnapshot.docs.map(doc => doc.data());

    const totalRevenue = orders.reduce((sum, o) => sum + o.totalPrice, 0);
    const totalPlatformFees = orders.reduce((sum, o) => sum + o.platformFee, 0);
    const totalGst = orders.reduce((sum, o) => sum + o.gst, 0);
    const totalDeliveryPayouts = orders.reduce((sum, o) => sum + o.deliveryPayout, 0);
    const netProfit = totalPlatformFees + totalGst - totalDeliveryPayouts;

    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Platform Revenue Report</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div class="bg-white p-4 rounded-xl shadow-md"><h4 class="text-sm font-semibold text-gray-500">Total Revenue</h4><p class="text-2xl font-bold">₹${totalRevenue.toFixed(2)}</p></div>
            <div class="bg-green-100 p-4 rounded-xl shadow-md"><h4 class="text-sm font-semibold text-green-800">Platform Fees</h4><p class="text-2xl font-bold text-green-800">₹${totalPlatformFees.toFixed(2)}</p></div>
            <div class="bg-yellow-100 p-4 rounded-xl shadow-md"><h4 class="text-sm font-semibold text-yellow-800">Delivery Payouts</h4><p class="text-2xl font-bold text-yellow-800">- ₹${totalDeliveryPayouts.toFixed(2)}</p></div>
            <div class="bg-blue-100 p-4 rounded-xl shadow-md"><h4 class="text-sm font-semibold text-blue-800">Net Profit</h4><p class="text-2xl font-bold text-blue-800">₹${netProfit.toFixed(2)}</p></div>
        </div>
         <div class="bg-white p-6 rounded-xl shadow-md"><canvas id="revenueChart"></canvas></div>
    `;
    const revenueByMonth = orders.reduce((acc, order) => {
        const month = new Date(order.createdAt.seconds * 1000).toLocaleString('default', { year: '2-digit', month: 'short' });
        acc[month] = (acc[month] || 0) + order.totalPrice;
        return acc;
    }, {});
    new Chart(document.getElementById('revenueChart'), {
        type: 'bar',
        data: {
            labels: Object.keys(revenueByMonth),
            datasets: [{ label: 'Total Revenue per Month', data: Object.values(revenueByMonth), backgroundColor: 'rgba(212, 175, 55, 0.8)' }]
        }
    });
}

async function renderRestaurantPayoutsView(contentArea) {
     contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Restaurant Payouts</h2><div id="payouts-list">Loading...</div>`;
     const listEl = document.getElementById('payouts-list');
     
     const restaurantsSnapshot = await db.collection('restaurants').get();
     const ordersSnapshot = await db.collection('orders').where('status', '==', 'delivered').get();
     const orders = ordersSnapshot.docs.map(d => d.data());

     let payoutHtml = restaurantsSnapshot.docs.map(doc => {
         const r = doc.data();
         const rOrders = orders.filter(o => o.restaurantId === doc.id);
         const totalSales = rOrders.reduce((sum, o) => sum + o.subtotal, 0);
         const totalPlatformFees = rOrders.reduce((sum, o) => sum + o.platformFee, 0);
         const netPayout = totalSales - totalPlatformFees;

         return `
            <div class="bg-white p-4 rounded-lg shadow-sm mb-3">
                <div class="grid grid-cols-4 items-center gap-4">
                    <p class="font-semibold col-span-2">${r.name}</p>
                    <div class="text-right">
                        <p class="text-sm text-gray-500">Net Payout</p>
                        <p class="font-bold text-lg">₹${netPayout.toFixed(2)}</p>
                    </div>
                    <div class="text-right">
                        <button class="btn btn-secondary" onclick="logAudit('Payout Marked Paid', 'Restaurant: ${r.name}')">Mark as Paid</button>
                    </div>
                </div>
            </div>
         `;
     }).join('');
     listEl.innerHTML = payoutHtml;
     feather.replace();
}

async function renderAllDeliveryEarningsView(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">All Delivery Earnings</h2><div id="delivery-earnings-list">Loading...</div>`;
    const listEl = document.getElementById('delivery-earnings-list');
    const deliveryUsersSnapshot = await db.collection('users').where('role', '==', 'delivery').get();
    
    const userEarnings = await Promise.all(deliveryUsersSnapshot.docs.map(async doc => {
        const user = doc.data();
        const ordersSnapshot = await db.collection('orders')
            .where('deliveryBoyId', '==', doc.id)
            .where('status', '==', 'delivered').get();
        const totalPayout = ordersSnapshot.docs.reduce((sum, o) => sum + o.data().deliveryPayout, 0);
        return { name: user.name, email: user.email, count: ordersSnapshot.size, total: totalPayout };
    }));

    listEl.innerHTML = `<div class="bg-white p-4 rounded-xl shadow-md overflow-x-auto">
        <table class="w-full text-sm text-left">
             <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                <tr><th class="p-3">Name</th><th class="p-3">Email</th><th class="p-3 text-center">Deliveries</th><th class="p-3 text-right">Total Payout</th></tr>
             </thead>
             <tbody>
                ${userEarnings.map(e => `
                    <tr class="border-b">
                        <td class="p-3 font-semibold">${e.name}</td>
                        <td class="p-3">${e.email}</td>
                        <td class="p-3 text-center">${e.count}</td>
                        <td class="p-3 text-right font-bold">₹${e.total.toFixed(2)}</td>
                    </tr>
                `).join('')}
             </tbody>
        </table>
    </div>`;
}

async function renderBroadcastMessageView(contentArea) {
     contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Broadcast Message</h2>
        <form id="broadcast-form" class="bg-white p-6 rounded-xl shadow-md space-y-4">
            <div>
                <label for="broadcast-role" class="block text-sm font-medium">Target Audience</label>
                <select id="broadcast-role" name="role" class="input-field w-full">
                    <option value="all">All Users</option>
                    <option value="customer">Customers</option>
                    <option value="restaurant">Restaurants</option>
                    <option value="delivery">Delivery Staff</option>
                </select>
            </div>
             <div>
                <label for="broadcast-subject" class="block text-sm font-medium">Subject</label>
                <input type="text" id="broadcast-subject" name="subject" class="input-field w-full" required>
            </div>
            <div>
                <label for="broadcast-message" class="block text-sm font-medium">Message</label>
                <textarea id="broadcast-message" name="message" class="input-field w-full" rows="8" required></textarea>
            </div>
            <button type="submit" class="btn btn-primary">Send Broadcast</button>
        </form>
    `;
    document.getElementById('broadcast-form').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const data = {
            target: form.elements.role.value,
            subject: form.elements.subject.value,
            message: form.elements.message.value,
            sentBy: currentUser.uid,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('broadcasts').add(data);
        await logAudit('Broadcast Sent', `Target: ${data.target}, Subject: ${data.subject}`);
        showSimpleModal('Success', 'Broadcast message has been logged. In a real app, this would trigger emails/notifications.');
        form.reset();
    });
}

async function renderSystemHealthView(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">System Health</h2>
        <div id="system-health-list" class="space-y-3"></div>`;
    const listEl = document.getElementById('system-health-list');
    const checks = [
        { name: 'Firebase Firestore', check: () => db.collection('settings').doc('config').get().then(() => true).catch(() => false) },
        { name: 'Firebase Auth', check: () => Promise.resolve(!!auth) }
    ];
    
    listEl.innerHTML = '<p>Running checks...</p>';
    let resultsHtml = '';
    for (const service of checks) {
        const isOperational = await service.check();
        resultsHtml += `
            <div class="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center">
                <p class="font-semibold">${service.name}</p>
                <span class="font-bold ${isOperational ? 'text-green-600' : 'text-red-600'}">${isOperational ? 'Operational' : 'Error'}</span>
            </div>
        `;
    }
    listEl.innerHTML = resultsHtml;
}

async function renderApiKeysView(contentArea) {
    contentArea.innerHTML = `
        <div class="flex justify-between items-center mb-6">
             <h2 class="text-3xl font-bold font-serif">API Key Management</h2>
             <button id="add-api-key-btn" class="btn btn-primary">Generate New Key</button>
        </div>
        <div id="api-keys-list" class="space-y-3"></div>`;
    const listEl = document.getElementById('api-keys-list');
    const unsub = db.collection('apiKeys').onSnapshot(snapshot => {
        listEl.innerHTML = snapshot.docs.map(doc => {
            const key = doc.data();
            const keyPreview = `${key.key.substring(0, 4)}...${key.key.substring(key.key.length - 4)}`;
            return `<div class="bg-white p-4 rounded-lg shadow-sm">
                        <p class="font-semibold">${key.name}</p>
                        <p class="font-mono text-sm bg-gray-100 p-1 my-1 inline-block rounded">${keyPreview}</p>
                        <p class="text-xs text-gray-500">Created: ${new Date(key.createdAt.seconds*1000).toLocaleDateString()}</p>
                        <button onclick="deleteApiKey('${doc.id}', '${key.name}')" class="btn btn-danger mt-2 py-1 px-3 text-sm">Revoke Key</button>
                    </div>`;
        }).join('') || '<p class="text-center bg-white p-6 rounded-lg shadow-md">No API keys found.</p>';
    });
    unsubscribeListeners.push(unsub);

    document.getElementById('add-api-key-btn').addEventListener('click', () => {
        const name = prompt("Enter a name for the new API key (e.g., 'Google Maps Integration'):");
        if (name) {
            const newKey = `unifood_sk_${[...Array(32)].map(() => Math.random().toString(36)[2]).join('')}`;
            db.collection('apiKeys').add({ name: name, key: newKey, createdAt: new Date() });
            logAudit('API Key Generated', `Name: ${name}`);
        }
    });
}

function deleteApiKey(id, name) {
    showConfirmationModal(`Revoke API Key?`, `Are you sure you want to revoke the key named "${name}"? This cannot be undone.`, async () => {
        await db.collection('apiKeys').doc(id).delete();
        await logAudit('API Key Revoked', `Name: ${name}`);
    });
}

async function renderSupportTicketsView(contentArea) {
     contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Support Tickets</h2><div id="support-tickets-list">Loading...</div>`;
     const listEl = document.getElementById('support-tickets-list');
     const unsub = db.collection('supportTickets').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
         listEl.innerHTML = snapshot.docs.map(doc => {
             const ticket = doc.data();
             const statusColors = { open: 'bg-red-200 text-red-800', closed: 'bg-green-200 text-green-800' };
             return `<div class="bg-white p-4 rounded-lg shadow-sm mb-3">
                         <div class="flex justify-between items-start">
                             <div>
                                <p class="font-semibold">${ticket.subject}</p>
                                <p class="text-sm text-gray-500">From: ${ticket.userName || 'N/A'}</p>
                             </div>
                             <span class="status-badge ${statusColors[ticket.status]}">${ticket.status}</span>
                         </div>
                         <p class="mt-2 p-3 bg-gray-50 rounded-md">${ticket.message}</p>
                         <div class="text-right mt-2">
                            ${ticket.status === 'open' ? `<button onclick="updateTicketStatus('${doc.id}', 'closed')" class="btn btn-secondary">Mark as Closed</button>` : ''}
                         </div>
                     </div>`;
         }).join('') || '<p class="text-center bg-white p-6 rounded-lg shadow-md">No support tickets found.</p>';
     });
    unsubscribeListeners.push(unsub);
}

async function updateTicketStatus(id, newStatus) {
    await db.collection('supportTickets').doc(id).update({ status: newStatus });
    await logAudit('Support Ticket Status Updated', `ID: ${id}, Status: ${newStatus}`);
}

async function renderIpBlacklistView(contentArea) {
     contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">IP Blacklist Management</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <form id="ip-blacklist-form" class="flex gap-2 mb-4">
                <input type="text" name="ip" class="input-field w-full" placeholder="Enter IP Address to Block" required>
                <button type="submit" class="btn btn-primary">Block IP</button>
            </form>
            <div id="ip-blacklist" class="space-y-2">Loading...</div>
        </div>`;
    
    const listEl = document.getElementById('ip-blacklist');
    const unsub = db.collection('security').doc('blacklist').onSnapshot(doc => {
        const data = doc.exists ? doc.data() : { ips: [] };
        listEl.innerHTML = data.ips.map(ip => `
            <div class="flex justify-between items-center bg-gray-100 p-2 rounded-md">
                <span class="font-mono">${ip}</span>
                <button onclick="unblockIp('${ip}')" class="btn btn-danger p-1 rounded-full"><i data-feather="x" class="w-4 h-4"></i></button>
            </div>
        `).join('') || '<p class="text-gray-500">No IPs are currently blacklisted.</p>';
        feather.replace();
    });
    unsubscribeListeners.push(unsub);

    document.getElementById('ip-blacklist-form').addEventListener('submit', async e => {
        e.preventDefault();
        const ip = e.target.elements.ip.value;
        await db.collection('security').doc('blacklist').set({ ips: firebase.firestore.FieldValue.arrayUnion(ip) }, { merge: true });
        await logAudit('IP Blacklisted', `IP: ${ip}`);
        e.target.reset();
    });
}

async function unblockIp(ip) {
    await db.collection('security').doc('blacklist').update({ ips: firebase.firestore.FieldValue.arrayRemove(ip) });
    await logAudit('IP Unblocked', `IP: ${ip}`);
}

async function renderAllReviewsView(contentArea) {
     contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">All User Reviews</h2><div id="all-reviews-list">Loading...</div>`;
     const listEl = document.getElementById('all-reviews-list');
     const snapshot = await db.collection('reviews').orderBy('createdAt', 'desc').limit(50).get();

     if (snapshot.empty) {
        listEl.innerHTML = '<p>No reviews found.</p>';
        return;
     }

     listEl.innerHTML = snapshot.docs.map(doc => {
        const r = doc.data();
        return `
            <div class="bg-white p-4 rounded-lg shadow-sm mb-4">
                <p class="text-sm text-gray-500">Order #${r.orderId.substring(0,6)} by ${r.customerName}</p>
                <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="border-r pr-4">
                        <p class="font-semibold">Restaurant: ${r.restaurantName}</p>
                        <p class="text-yellow-500">${'★'.repeat(r.restaurantRating)}${'☆'.repeat(5-r.restaurantRating)}</p>
                        <p class="text-sm italic">"${r.restaurantReview || 'No comment'}"</p>
                    </div>
                    <div>
                        <p class="font-semibold">Delivery: ${r.deliveryBoyName}</p>
                        <p class="text-yellow-500">${'★'.repeat(r.deliveryRating)}${'☆'.repeat(5-r.deliveryRating)}</p>
                        <p class="text-sm italic">"${r.deliveryReview || 'No comment'}"</p>
                    </div>
                </div>
            </div>
        `;
     }).join('');
}


// --- UTILITY & MODAL FUNCTIONS ---

function showModal(contentHtml) {
    modalContainer.innerHTML = `<div class="modal-content">${contentHtml}</div>`;
    modalContainer.classList.add('active');
    feather.replace();
}

function showSimpleModal(title, message, onOk) {
    const modalHtml = `
        <div class="text-center">
            <h3 class="text-2xl font-bold font-serif mb-2">${title}</h3>
            <p class="mb-6">${message}</p>
            <button id="simple-modal-ok" class="btn btn-primary rounded-lg py-2 px-12">OK</button>
        </div>
    `;
    showModal(modalHtml);
    document.getElementById('simple-modal-ok').addEventListener('click', () => {
        if (onOk) onOk();
        closeModal();
    });
}

function showConfirmationModal(title, message, onConfirm, onCancel) {
    const modalHtml = `
        <div class="text-center">
            <h3 class="text-2xl font-bold font-serif mb-2">${title}</h3>
            <p class="mb-6">${message}</p>
            <div class="flex justify-center gap-4">
                <button id="confirm-cancel" class="btn bg-gray-200 rounded-lg py-2 px-8">Cancel</button>
                <button id="confirm-ok" class="btn btn-danger rounded-lg py-2 px-8">Confirm</button>
            </div>
        </div>
    `;
    showModal(modalHtml);

    document.getElementById('confirm-ok').addEventListener('click', () => {
        if (onConfirm) onConfirm();
        closeModal();
    });
    document.getElementById('confirm-cancel').addEventListener('click', () => {
        if (onCancel) onCancel();
        closeModal();
    });
}

function closeModal() {
    modalContainer.classList.remove('active');
    modalContainer.innerHTML = '';
}

function cleanupListeners() {
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
}

function applySiteSettings() {
    // Basic branding
    if (siteSettings.websiteName) {
        websiteNameHeader.textContent = siteSettings.websiteName + " Super Admin";
        document.title = siteSettings.websiteName + " - Super Admin";
    }
    if (siteSettings.logoUrl) {
        websiteLogoHeader.src = siteSettings.logoUrl;
    }

    // Advanced Theme Settings
    const theme = siteSettings.theme || {};
    const globalTheme = theme.global || {};

    document.documentElement.style.setProperty('--primary-color', globalTheme.primaryColor || '#1a202c');
    document.documentElement.style.setProperty('--secondary-color', globalTheme.secondaryColor || '#D4AF37');
    document.documentElement.style.setProperty('--background-color', globalTheme.backgroundColor || '#F8F9FA');
    document.documentElement.style.setProperty('--text-color', globalTheme.textColor || '#1f2937');
    document.documentElement.style.setProperty('--button-text-color', globalTheme.buttonTextColor || '#ffffff');
    
    // Gradient logic for header
    if (globalTheme.useGradient) {
        const gradient = `linear-gradient(to right, ${globalTheme.gradientStart || '#4c51bf'}, ${globalTheme.gradientEnd || '#6b46c1'})`;
        document.documentElement.style.setProperty('--header-bg', gradient);
        websiteNameHeader.classList.add('text-white'); // Make header text readable on gradient
    } else {
        document.documentElement.style.setProperty('--header-bg', '#ffffff');
        websiteNameHeader.classList.remove('text-white');
    }
}

async function logAudit(action, details) {
    if (!currentUser) return;
    try {
        await db.collection('auditLog').add({
            action: action,
            details: details,
            performedBy: currentUser.name,
            role: currentUser.role,
            userId: currentUser.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Failed to write audit log:", error);
    }
}


// --- INITIALIZE APP ON LOAD ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    feather.replace();
});

logoutBtn.addEventListener('click', () => {
    cleanupListeners();
    auth.signOut();
});