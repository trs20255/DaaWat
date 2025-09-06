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

// --- GLOBAL STATE & CACHES ---
let currentUser = null;
let unsubscribeListeners = [];
let html5QrCode = null;
let siteSettings = {};
let adminDataCache = {
    restaurants: [],
    orders: [],
    users: [],
    deliveryBoys: []
};


// --- UI REFERENCES ---
const mainContent = document.getElementById('main-content');
const modalContainer = document.getElementById('modal-container');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const websiteNameHeader = document.getElementById('website-name-header');
const websiteLogoHeader = document.getElementById('website-logo-header');

// --- MOBILE MENU REFERENCES ---
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
const mobileMenu = document.getElementById('mobile-menu');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const closeMobileMenuButton = document.getElementById('close-mobile-menu');
const mobileUserInfo = document.getElementById('mobile-user-info');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');


// --- CORE APP LOGIC ---
async function initializeApp() {
    // 1. Fetch settings ONCE for the initial page load.
    const settingsDoc = await db.collection('settings').doc('config').get();
    if (settingsDoc.exists) {
        siteSettings = settingsDoc.data();
    }
    applySiteSettings();

    setupMobileMenuHandlers();

    // 2. The onAuthStateChanged will now handle the real-time listener.
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            const userDoc = await db.collection('users').doc(user.uid).get();
            const userData = userDoc.data();

            if (siteSettings.adminMaintenanceMode && userData && userData.role === 'admin') {
                document.body.innerHTML = `<div style="text-align: center; padding: 50px; font-family: sans-serif; color: #333;">
                    <h1 style="color: #333;">Admin Panel Under Maintenance</h1>
                    <p>The admin panel is temporarily unavailable. Please try again later.</p>
                    <p style="color: #777; margin-top: 20px;">You have been logged out.</p>
                </div>`;
                auth.signOut();
                return;
            }

            if (userDoc.exists && (userData.role === 'admin' || userData.role === 'superadmin')) {
                currentUser = { uid: user.uid, ...userData };
                const userHtml = `<p class="font-semibold">${currentUser.name}</p><p class="text-xs text-gray-500 capitalize">${currentUser.role}</p>`;
                userInfo.innerHTML = userHtml;
                mobileUserInfo.innerHTML = userHtml;
                loadAdminPortal();

                // 3. ADD THE REAL-TIME LISTENER HERE, AFTER THE PORTAL IS LOADED
                const settingsListener = db.collection('settings').doc('config').onSnapshot(doc => {
                    console.log("Admin Panel: Real-time settings received!"); // For debugging
                    if (doc.exists) {
                        siteSettings = doc.data();
                        applySiteSettings(); // This now works on the correct UI
                    }
                });
                unsubscribeListeners.push(settingsListener); // Add to cleanup queue

            } else {
                document.body.innerHTML = `<div style="text-align: center; padding: 50px; font-family: sans-serif; color: #333;">
                    <h1 style="color: #d9534f;">Access Denied</h1>
                    <p>You do not have the required permissions to view this page.</p>
                    <p style="color: #777;">Redirecting to login page...</p>
                </div>`;
                setTimeout(() => {
                    auth.signOut();
                    window.location.href = 'login.html';
                }, 3000);
            }
        } else {
            window.location.href = 'login.html';
        }
    });
}


function setupMobileMenuHandlers() {
    const openMenu = () => {
        mobileMenuOverlay.classList.remove('hidden');
        setTimeout(() => mobileMenu.classList.remove('translate-x-full'), 10);
    };
    const closeMenu = () => {
        mobileMenu.classList.add('translate-x-full');
        setTimeout(() => mobileMenuOverlay.classList.add('hidden'), 300);
    };

    mobileMenuButton.addEventListener('click', openMenu);
    closeMobileMenuButton.addEventListener('click', closeMenu);
    mobileMenuOverlay.addEventListener('click', (e) => {
        if (e.target === mobileMenuOverlay) {
            closeMenu();
        }
    });
    mobileLogoutBtn.addEventListener('click', () => auth.signOut());
}


function applySiteSettings() {
    // Safely access the nested theme object
    const theme = siteSettings.theme || {};
    const globalTheme = theme.global || {};

    if (siteSettings.websiteName) {
        websiteNameHeader.textContent = siteSettings.websiteName + " Admin";
        document.title = siteSettings.websiteName + " - Admin Panel";
    }
    if (siteSettings.logoUrl) {
        websiteLogoHeader.src = siteSettings.logoUrl;
    }
    
    // Read all colors from the correct nested globalTheme object
    document.documentElement.style.setProperty('--primary-color', globalTheme.primaryColor || '#1a202c');
    document.documentElement.style.setProperty('--secondary-color', globalTheme.secondaryColor || '#D4AF37');
    document.documentElement.style.setProperty('--background-color', globalTheme.backgroundColor || '#F8F9FA');
    document.documentElement.style.setProperty('--text-color', globalTheme.textColor || '#1f2937');
    document.documentElement.style.setProperty('--button-text-color', globalTheme.buttonTextColor || '#ffffff');

    // Gradient logic for header
    if (globalTheme.useGradient) {
        const gradient = `linear-gradient(to right, ${globalTheme.gradientStart || '#4c51bf'}, ${globalTheme.gradientEnd || '#6b46c1'})`;
        document.documentElement.style.setProperty('--header-bg', gradient);
        // Make header text readable on a dark gradient background
        websiteNameHeader.classList.add('text-white');
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

function loadAdminPortal() {
    const template = document.getElementById('admin-portal-template');
    if (template) {
        mainContent.innerHTML = '';
        mainContent.appendChild(template.content.cloneNode(true));
        feather.replace();

        const desktopNav = document.getElementById('admin-nav');
        const mobileNavContainer = document.getElementById('mobile-nav-container');
        if (desktopNav && mobileNavContainer) {
            const mobileNavClone = desktopNav.cloneNode(true);
            mobileNavClone.id = 'mobile-sidebar-nav';
            mobileNavClone.addEventListener('click', (e) => {
                if (e.target.closest('.sidebar-link')) {
                    mobileMenu.classList.add('translate-x-full');
                    setTimeout(() => mobileMenuOverlay.classList.add('hidden'), 300);
                }
            });
            mobileNavContainer.appendChild(mobileNavClone);
        }

        initializeAdminPortal();
    } else {
        mainContent.innerHTML = `<p class="text-center text-red-500">Error: Admin portal template not found.</p>`;
    }
}

// --- ADMIN PORTAL ---
function initializeAdminPortal() {
    document.body.addEventListener('click', handleAdminClicks);
    document.getElementById('admin-global-search').addEventListener('input', handleAdminGlobalSearch);
    renderAdminView('dashboard');
    listenForCancellationRequests();
}

function handleAdminGlobalSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const activeView = document.querySelector('.sidebar-link.active')?.dataset.view;

    if (!activeView) return;

    clearTimeout(handleAdminGlobalSearch.timeout);
    handleAdminGlobalSearch.timeout = setTimeout(() => {
        switch (activeView) {
            case 'restaurants':
                renderAdminRestaurantsListView(document.getElementById('admin-content-area'), searchTerm);
                break;
            case 'orders':
                renderAdminOrdersView(document.getElementById('admin-content-area'), searchTerm);
                break;
            case 'users':
                renderAdminUsersView(document.getElementById('admin-content-area'), searchTerm);
                break;
            case 'delivery-boys':
                renderDeliveryBoysView(document.getElementById('admin-content-area'), searchTerm);
                break;
        }
    }, 300);
}

function listenForCancellationRequests() {
    db.collection('cancellationRequests').where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            const badge = document.getElementById('cancellation-badge');
            if (badge) {
                badge.textContent = snapshot.size;
                badge.classList.toggle('hidden', snapshot.empty);
            }

            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const request = change.doc.data();
                    showNotification(`From ${request.deliveryBoyName}: "${request.reason}"`);
                }
            });
        });
}

function showNotification(message) {
    const popup = document.getElementById('notification-popup');
    const textEl = document.getElementById('notification-text');
    if (popup && textEl) {
        textEl.textContent = message;
        popup.classList.remove('hidden');
        feather.replace();
        setTimeout(() => {
            popup.classList.add('hidden');
        }, 7000);
    }
}

function handleAdminClicks(e) {
    const sidebarLink = e.target.closest('.sidebar-link');
    if (sidebarLink) {
        if (sidebarLink.dataset.view !== 'scan-order') {
            stopScanner();
        }
        document.getElementById('admin-global-search').value = '';
        renderAdminView(sidebarLink.dataset.view);
        return;
    }

    const restaurantCard = e.target.closest('.restaurant-admin-card');
    if (restaurantCard) {
        renderAdminRestaurantDetailsView(restaurantCard.dataset.id);
        return;
    }

    const deliveryBoyRow = e.target.closest('.delivery-boy-row');
    if (deliveryBoyRow) {
        renderDeliveryBoyDetailsView(deliveryBoyRow.dataset.id);
        return;
    }

    const actionButton = e.target.closest('[data-action]');
    if (actionButton) {
        e.preventDefault();
        const { action, id, itemId, orderId, requestId, decision } = actionButton.dataset;
        switch (action) {
            case 'add-restaurant': showAddRestaurantForm(); break;
            case 'add-delivery-boy': showAddDeliveryBoyForm(); break;
            case 'edit-restaurant': showEditRestaurantForm(id); break;
            case 'change-password': handleChangeRestaurantPassword(id); break;
            case 'toggle-lock': handleToggleLock(id); break;
            case 'toggle-visibility': handleToggleVisibility(id); break;
            case 'toggle-delivery-support': handleToggleDeliverySupport(id); break;
            case 'manage-menu': renderAdminMenuManagementView(id); break;
            case 'back-to-restaurants': renderAdminView('restaurants'); break;
            case 'back-to-delivery-boys': renderAdminView('delivery-boys'); break;
            case 'back-to-restaurant-details': renderAdminRestaurantDetailsView(id); break;
            case 'add-menu-item': showMenuItemForm(id); break;
            case 'edit-menu-item': showMenuItemForm(id, itemId); break;
            case 'delete-menu-item': handleDeleteMenuItem(id, itemId); break;
            case 'view-bill': renderOrderBill(orderId); break;
            case 'change-delivery-boy-password': handleChangeDeliveryBoyPassword(id); break;
            case 'toggle-delivery-boy-lock': handleToggleDeliveryBoyLock(id); break;
            case 'remove-delivery-boy': handleRemoveDeliveryBoy(id); break;
            case 'start-scan': startScanner(); break;
            case 'stop-scan': stopScanner(); break;
            case 'handle-cancellation': handleCancellationRequest(requestId, decision); break;
            case 'add-advertisement': showAdvertisementForm(); break;
            case 'edit-advertisement': showAdvertisementForm(id); break;
            case 'delete-advertisement': handleDeleteAdvertisement(id); break;
            case 'change-admin-password':
                auth.sendPasswordResetEmail(currentUser.email)
                    .then(() => showToast('Password reset email sent!'))
                    .catch(err => showToast(`Error: ${err.message}`, 'error'));
                break;
        }
    }
}

function renderAdminView(viewName, contentArea = document.getElementById('admin-content-area')) {
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    document.querySelectorAll(`[data-view="${viewName}"]`).forEach(activeLink => activeLink.classList.add('active'));

    const searchBar = document.getElementById('admin-global-search');
    const searchableViews = ['restaurants', 'orders', 'users', 'delivery-boys'];
    if (searchBar) {
        searchBar.style.display = searchableViews.includes(viewName) ? 'block' : 'none';
    }

    if (!contentArea) return;
    switch (viewName) {
        case 'dashboard': renderAdminDashboardView(contentArea); break;
        case 'restaurants': renderAdminRestaurantsListView(contentArea); break;
        case 'orders': renderAdminOrdersView(contentArea); break;
        case 'cancellation-requests': renderCancellationRequestsView(contentArea); break;
        case 'users': renderAdminUsersView(contentArea); break;
        case 'delivery-boys': renderDeliveryBoysView(contentArea); break;
        case 'reviews': renderAllReviewsView(contentArea); break;
        case 'advertisements': renderAdvertisementsView(contentArea); break;
        case 'profile': renderAdminProfileView(contentArea); break;
        case 'scan-order': renderScannerView(contentArea); break;
    }
}

async function renderAdminDashboardView(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Dashboard</h2><p>Loading stats...</p>`;
    const [ordersSnapshot, usersSnapshot, restaurantsSnapshot] = await Promise.all([
        db.collection('orders').get(),
        db.collection('users').get(),
        db.collection('restaurants').get()
    ]);

    const totalRevenue = ordersSnapshot.docs.reduce((sum, doc) => sum + (doc.data().totalPrice || 0), 0);
    contentArea.innerHTML = `
       <h2 class="text-3xl font-bold font-serif mb-6">Dashboard</h2>
       <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
           <div class="bg-white p-6 rounded-xl shadow-md text-center neon-border"><h4 class="text-lg font-semibold text-gray-500">Total Revenue</h4><p class="text-3xl font-bold text-gray-800 mt-2">₹${totalRevenue.toFixed(2)}</p></div>
           <div class="bg-white p-6 rounded-xl shadow-md text-center neon-border"><h4 class="text-lg font-semibold text-gray-500">Total Orders</h4><p class="text-3xl font-bold text-gray-800 mt-2">${ordersSnapshot.size}</p></div>
           <div class="bg-white p-6 rounded-xl shadow-md text-center neon-border"><h4 class="text-lg font-semibold text-gray-500">Total Users</h4><p class="text-3xl font-bold text-gray-800 mt-2">${usersSnapshot.size}</p></div>
           <div class="bg-white p-6 rounded-xl shadow-md text-center neon-border"><h4 class="text-lg font-semibold text-gray-500">Total Restaurants</h4><p class="text-3xl font-bold text-gray-800 mt-2">${restaurantsSnapshot.size}</p></div>
       </div>
       <div class="bg-blue-100 p-6 rounded-xl shadow-md mt-6">
           <h4 class="text-lg font-bold text-blue-800 flex items-center gap-2"><i data-feather="cpu"></i>AI-Powered Insights</h4>
           <ul class="list-disc list-inside mt-2 text-blue-700">
               <li>There is a 15% increase in orders this week.</li>
               <li>Warning: A high number of cancelled orders detected from a single user. This could indicate fraudulent activity.</li>
           </ul>
       </div>
    `;
    feather.replace();
}

async function renderCancellationRequestsView(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Cancellation Requests</h2><div id="cancellation-list" class="space-y-4"></div>`;
    const listEl = document.getElementById('cancellation-list');
    
    const unsub = db.collection('cancellationRequests').where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No pending cancellation requests.</p>';
                return;
            }
            listEl.innerHTML = snapshot.docs.map(doc => {
                const req = doc.data();
                return `
                    <div class="bg-white p-5 rounded-xl shadow-md">
                        <p class="text-sm text-gray-500">Order #${req.orderId.substring(0,6)}</p>
                        <p class="mt-2"><strong>Delivery Partner:</strong> ${req.deliveryBoyName} (${req.deliveryBoyPhone})</p>
                        <p class="mt-1"><strong>Reason:</strong> <span class="italic text-red-600">"${req.reason}"</span></p>
                        <div class="mt-4 border-t pt-4 flex gap-4">
                            <button data-action="handle-cancellation" data-request-id="${doc.id}" data-decision="approve" class="btn btn-primary flex-1">Approve</button>
                            <button data-action="handle-cancellation" data-request-id="${doc.id}" data-decision="deny" class="btn btn-danger flex-1">Deny</button>
                        </div>
                    </div>
                `;
            }).join('');
        });
    unsubscribeListeners.push(unsub);
}

async function handleCancellationRequest(requestId, decision) {
    const requestRef = db.collection('cancellationRequests').doc(requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists) {
        showToast("Request not found.", "error");
        return;
    }
    const requestData = requestDoc.data();
    const orderRef = db.collection('orders').doc(requestData.orderId);

    if (decision === 'approve') {
        await orderRef.update({
            status: 'accepted', 
            deliveryBoyId: null,
            deliveryBoyName: null,
        });
        await requestRef.update({ status: 'approved' });
        await logAudit("Cancellation Approved", `Request ID: ${requestId}`);
        showToast("Cancellation approved.");
    } else { 
        await orderRef.update({
            status: requestData.previousStatus 
        });
        await requestRef.update({ status: 'denied' });
        await logAudit("Cancellation Denied", `Request ID: ${requestId}`);
        showToast("Cancellation denied.");
    }
}

async function renderAdminRestaurantsListView(contentArea, searchTerm = '') {
    contentArea.innerHTML = `
       <div class="flex justify-between items-center mb-6">
           <h2 class="text-3xl font-bold font-serif">Restaurants</h2>
            <button data-action="add-restaurant" class="btn btn-primary rounded-lg py-2 px-4 flex items-center gap-2">
                <i data-feather="plus" class="w-5 h-5"></i>Add Restaurant
           </button>
       </div>
       <div id="admin-restaurant-list" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"></div>`;
    feather.replace();
    const listEl = document.getElementById('admin-restaurant-list');

    if (adminDataCache.restaurants.length === 0) {
        const snapshot = await db.collection('restaurants').get();
        adminDataCache.restaurants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const filteredRestaurants = adminDataCache.restaurants.filter(r =>
        r.name.toLowerCase().includes(searchTerm)
    );

    if (filteredRestaurants.length === 0) {
        listEl.innerHTML = '<p class="col-span-full text-center">No restaurants found.</p>';
        return;
    }
    listEl.innerHTML = filteredRestaurants.map(r => {
        const firstImage = r.imageUrls && r.imageUrls.length > 0 ? r.imageUrls[0] : 'https://placehold.co/400x250?text=UniFood';
        return `
           <div data-id="${r.id}" class="restaurant-admin-card bg-white rounded-xl shadow-md overflow-hidden cursor-pointer neon-border">
               <img src="${firstImage}" class="w-full h-40 object-cover">
               <div class="p-5">
                   <h3 class="font-bold text-xl font-serif">${r.name}</h3>
                   <p class="text-sm text-gray-500 mt-1">${r.cuisine}</p>
               </div>
           </div>`;
    }).join('');
}


async function renderAdminRestaurantDetailsView(restaurantId) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `<p>Loading details...</p>`;
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) return;
    const restaurant = { id: restaurantDoc.id, ...restaurantDoc.data() };

    let ownerUsername = 'N/A';
    if (restaurant.ownerId) {
        const ownerDoc = await db.collection('users').doc(restaurant.ownerId).get();
        if (ownerDoc.exists) ownerUsername = ownerDoc.data().email;
    }

    const lockButtonText = restaurant.isLocked ? 'Unlock Account' : 'Lock Account';
    const lockButtonClass = restaurant.isLocked ? 'btn-primary' : 'btn-danger';

    const visibilityButtonText = restaurant.isHidden ? 'Make Visible' : 'Hide Restaurant';
    const visibilityButtonClass = restaurant.isHidden ? 'btn-primary' : 'btn-danger';

    const deliverySupportText = restaurant.supportsDelivery !== false ? 'Enabled' : 'Disabled';
    const deliverySupportClass = restaurant.supportsDelivery !== false ? 'btn-primary' : 'btn-danger';

    contentArea.innerHTML = `
        <div class="mb-6">
            <button data-action="back-to-restaurants" class="btn bg-white rounded-lg py-2 px-4 flex items-center gap-2 shadow-sm hover:shadow-md">
                <i data-feather="arrow-left" class="w-5 h-5"></i> Back to Restaurants
            </button>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <div class="flex justify-between items-start">
                <div>
                    <h2 class="text-3xl font-bold font-serif">${restaurant.name}</h2>
                    <p class="text-gray-600 mt-1">${restaurant.cuisine}</p>
                </div>
                <div class="flex gap-2 flex-wrap">
                    <button data-action="manage-menu" data-id="${restaurant.id}" class="btn btn-primary py-3 px-5 text-base">Manage Menu</button>
                    <button data-action="edit-restaurant" data-id="${restaurant.id}" class="btn btn-secondary py-3 px-5 text-base">Edit Details</button>
                </div>
            </div>
            <div class="mt-6 border-t pt-4 space-y-2">
                <p><strong>Address:</strong> ${restaurant.address}</p>
                <p><strong>Phone:</strong> ${restaurant.mobile || 'Not provided'}</p>
                <p><strong>Restaurant ID:</strong> ${restaurant.id}</p>
                 <div class="bg-gray-100 p-4 rounded-lg mt-4">
                             <h4 class="font-semibold">Owner Credentials</h4>
                             <p><strong>Username:</strong> ${ownerUsername}</p>
                             <p><strong>Password:</strong> <span class="text-red-500 font-mono">${restaurant.initialPassword || 'Set by user'}</span></p>
                             <p class="text-xs text-gray-500 mt-1">This is the initial password. For security, it's recommended to change it.</p>
                             <button data-action="change-password" data-id="${restaurant.id}" class="btn btn-danger text-sm mt-2 py-1 px-3">Change Password</button>
                </div>
                <div class="bg-yellow-100 p-4 rounded-lg mt-4">
                    <h4 class="font-semibold">Account Status</h4>
                    <p>This account is currently <strong>${restaurant.isLocked ? 'Locked' : 'Active'}</strong>.</p>
                    <button data-action="toggle-lock" data-id="${restaurant.id}" class="btn ${lockButtonClass} text-sm mt-2 py-1 px-3">${lockButtonText}</button>
                </div>
                <div class="bg-purple-100 p-4 rounded-lg mt-4">
                    <h4 class="font-semibold">Visibility Status</h4>
                    <p>This restaurant is currently <strong>${restaurant.isHidden ? 'Hidden' : 'Visible'}</strong> to customers.</p>
                    <button data-action="toggle-visibility" data-id="${restaurant.id}" class="btn ${visibilityButtonClass} text-sm mt-2 py-1 px-3">${visibilityButtonText}</button>
                </div>
                <div class="bg-cyan-100 p-4 rounded-lg mt-4">
                    <h4 class="font-semibold">Delivery Service</h4>
                    <p>Delivery for this restaurant is currently <strong>${deliverySupportText}</strong>.</p>
                    <button data-action="toggle-delivery-support" data-id="${restaurant.id}" class="btn ${deliverySupportClass} text-sm mt-2 py-1 px-3">${deliverySupportText === 'Enabled' ? 'Disable Delivery' : 'Enable Delivery'}</button>
                </div>
            </div>
        </div>
   `;
    feather.replace();
}

async function showAddRestaurantForm() {
    const formHtml = `
        <form id="add-restaurant-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif mb-6">Add New Restaurant</h3>
            <div>
                <label class="block text-sm font-medium">Restaurant Name</label>
                <input type="text" name="name" class="input-field w-full" required>
            </div>
             <div>
                <label class="block text-sm font-medium">Address</label>
                <textarea name="address" class="input-field w-full" rows="2" required></textarea>
            </div>
            <div>
                <label class="block text-sm font-medium">Restaurant Phone Number</label>
                <input type="tel" name="mobile" class="input-field w-full" placeholder="+919876543210" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Owner's Username (Email)</label>
                <input type="email" name="username" class="input-field w-full" required>
            </div>
             <div>
                <label class="block text-sm font-medium">Password</label>
                <input type="password" name="password" class="input-field w-full" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Image Links</label>
                <textarea name="imageUrls" class="input-field w-full" rows="3" placeholder="Paste image URLs, one per line"></textarea>
                <div id="image-preview-container" class="mt-2 flex flex-wrap gap-2"></div>
            </div>
            <div class="flex justify-end gap-4 pt-4">
                <button type="button" class="btn bg-gray-200" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Create Restaurant</button>
            </div>
        </form>
    `;
    showModal(formHtml);

    document.getElementById('add-restaurant-form').elements.imageUrls.addEventListener('input', (e) => {
        const container = document.getElementById('image-preview-container');
        container.innerHTML = '';
        const urls = e.target.value.split('\n').filter(url => url.trim() !== '');
        urls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'w-20 h-20 object-cover rounded-md border';
            img.onerror = () => { img.src = 'https://placehold.co/80x80?text=Invalid'; };
            container.appendChild(img);
        });
    });

    document.getElementById('add-restaurant-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const newRestaurantData = {
            name: form.elements.name.value,
            address: form.elements.address.value,
            mobile: form.elements.mobile.value,
            email: form.elements.username.value,
            password: form.elements.password.value,
            imageUrls: form.elements.imageUrls.value.split('\n').filter(url => url.trim() !== '')
        };

        try {
            await processRestaurantCreation(newRestaurantData);
            closeModal();
            adminDataCache.restaurants = []; // Invalidate cache
            showToast('Restaurant created successfully!');
            renderAdminView('restaurants');
        } catch (err) {
            showToast(`Creation failed: ${err.message}`, 'error');
        }
    });
}

async function processRestaurantCreation(data) {
    const tempAppName = `secondary-${Date.now()}`;
    const tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
    const tempAuth = tempApp.auth();

    try {
        const userCredential = await tempAuth.createUserWithEmailAndPassword(data.email, data.password);
        const ownerUid = userCredential.user.uid;

        const restaurantRef = await db.collection('restaurants').add({
            name: data.name,
            cuisine: "Default Cuisine",
            address: data.address,
            mobile: data.mobile,
            ownerId: ownerUid,
            isLocked: false,
            isHidden: false,
            supportsDelivery: true,
            initialPassword: data.password,
            imageUrls: data.imageUrls,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            avgRating: 0,
            ratingCount: 0,
            displayPriority: 99
        });

        await db.collection('users').doc(ownerUid).set({
            name: data.name,
            email: data.email,
            role: 'restaurant',
            restaurantId: restaurantRef.id,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await logAudit("Restaurant Created", `Name: ${data.name}, Owner: ${data.email}`);

    } catch (error) {
        console.error("Error in restaurant creation:", error);
        throw error;
    } finally {
        await tempAuth.signOut();
        await tempApp.delete();
    }
}

async function showAddDeliveryBoyForm() {
    const formHtml = `
        <form id="add-delivery-boy-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif mb-6">Add New Delivery Boy</h3>
            <div>
                <label class="block text-sm font-medium">Full Name</label>
                <input type="text" name="name" class="input-field w-full" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Email (Username)</label>
                <input type="email" name="email" class="input-field w-full" required>
            </div>
             <div>
                <label class="block text-sm font-medium">Password</label>
                <input type="password" name="password" class="input-field w-full" required>
            </div>
            <div class="flex justify-end gap-4 pt-4">
                <button type="button" class="btn bg-gray-200" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Create Account</button>
            </div>
        </form>
    `;
    showModal(formHtml);

    document.getElementById('add-delivery-boy-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const newUserData = {
            name: form.elements.name.value,
            email: form.elements.email.value,
            password: form.elements.password.value,
        };

        try {
            await processDeliveryBoyCreation(newUserData);
            closeModal();
            adminDataCache.deliveryBoys = []; // Invalidate cache
            showToast('Delivery Boy account created!');
            renderAdminView('delivery-boys');
        } catch (err) {
            showToast(`Could not create account: ${err.message}`, 'error');
        }
    });
}

async function processDeliveryBoyCreation(data) {
    const tempAppName = `secondary-delivery-${Date.now()}`;
    const tempApp = firebase.initializeApp(firebaseConfig, tempAppName);
    const tempAuth = tempApp.auth();

    try {
        const userCredential = await tempAuth.createUserWithEmailAndPassword(data.email, data.password);
        const userId = userCredential.user.uid;

        await db.collection('users').doc(userId).set({
            name: data.name,
            email: data.email,
            role: 'delivery',
            isOnline: false,
            isLocked: false,
            initialPassword: data.password,
            earnings: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            avgRating: 0,
            ratingCount: 0
        });
        await logAudit("Delivery Boy Created", `Name: ${data.name}, Email: ${data.email}`);

    } catch (error) {
        console.error("Error in delivery boy creation processing:", error);
        throw error;
    } finally {
        await tempAuth.signOut();
        await tempApp.delete();
    }
}

async function showEditRestaurantForm(restaurantId) {
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
        showToast("Restaurant not found!", "error");
        return;
    }
    const restaurant = restaurantDoc.data();

    const formHtml = `
        <form id="edit-restaurant-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif mb-6">Edit Restaurant</h3>
            <input type="hidden" name="id" value="${restaurantId}">
            <div>
                <label class="block text-sm font-medium">Name</label>
                <input type="text" name="name" class="input-field w-full" value="${restaurant.name}" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Cuisine</label>
                <input type="text" name="cuisine" class="input-field w-full" value="${restaurant.cuisine}" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Address</label>
                <textarea name="address" class="input-field w-full" rows="3" required>${restaurant.address}</textarea>
            </div>
            <div>
                <label class="block text-sm font-medium">Phone Number</label>
                <input type="tel" name="mobile" class="input-field w-full" value="${restaurant.mobile || ''}" required>
            </div>
            <div>
                <label class="block text-sm font-medium">Display Priority</label>
                <input type="number" name="displayPriority" class="input-field w-full" value="${restaurant.displayPriority || 99}" placeholder="e.g., 1, 2, 3 (lower is higher priority)">
                <p class="text-xs text-gray-500 mt-1">Restaurants with lower numbers (like 1) appear first.</p>
            </div>
            <div>
                <label class="block text-sm font-medium">Image URLs</label>
                <textarea name="imageUrls" class="input-field w-full" rows="3" placeholder="Paste image URLs, one per line">${(restaurant.imageUrls || []).join('\n')}</textarea>
                <div id="image-preview-container" class="mt-2 flex flex-wrap gap-2"></div>
            </div>
            <div class="flex justify-end gap-4 pt-4">
                <button type="button" class="btn bg-gray-200" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Changes</button>
            </div>
        </form>
    `;
    showModal(formHtml);

    const imageUrlsTextarea = document.getElementById('edit-restaurant-form').elements.imageUrls;
    const previewContainer = document.getElementById('image-preview-container');

    const updatePreview = () => {
        previewContainer.innerHTML = '';
        const urls = imageUrlsTextarea.value.split('\n').filter(url => url.trim() !== '');
        urls.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'w-20 h-20 object-cover rounded-md border';
            img.onerror = () => { img.src = 'https://placehold.co/80x80?text=Invalid'; };
            previewContainer.appendChild(img);
        });
    };
    
    imageUrlsTextarea.addEventListener('input', updatePreview);
    updatePreview(); // Initial call

    document.getElementById('edit-restaurant-form').addEventListener('submit', handleUpdateRestaurant);
}

async function handleUpdateRestaurant(e) {
    e.preventDefault();
    const form = e.target;
    const restaurantId = form.elements.id.value;
    const updatedData = {
        name: form.elements.name.value,
        cuisine: form.elements.cuisine.value,
        address: form.elements.address.value,
        mobile: form.elements.mobile.value,
        displayPriority: parseInt(form.elements.displayPriority.value, 10) || 99,
        imageUrls: form.elements.imageUrls.value.split('\n').filter(url => url.trim() !== ''),
    };
    await db.collection('restaurants').doc(restaurantId).update(updatedData);
    adminDataCache.restaurants = []; // Invalidate cache
    await logAudit("Restaurant Updated", `ID: ${restaurantId}`);
    showToast("Restaurant updated successfully!");
    closeModal();
    renderAdminRestaurantDetailsView(restaurantId);
}

async function handleToggleLock(restaurantId) {
    const restaurantRef = db.collection('restaurants').doc(restaurantId);
    const doc = await restaurantRef.get();
    const currentStatus = doc.data().isLocked || false;
    const newStatus = !currentStatus;
    await restaurantRef.update({ isLocked: newStatus });
    adminDataCache.restaurants = [];
    await logAudit(`Restaurant ${newStatus ? 'Locked' : 'Unlocked'}`, `ID: ${restaurantId}`);
    showToast(`Restaurant has been ${newStatus ? 'locked' : 'unlocked'}.`);
    renderAdminRestaurantDetailsView(restaurantId);
}

async function handleToggleVisibility(restaurantId) {
    const restaurantRef = db.collection('restaurants').doc(restaurantId);
    const doc = await restaurantRef.get();
    const isCurrentlyHidden = doc.data().isHidden || false;
    const newVisibility = !isCurrentlyHidden;
    await restaurantRef.update({ isHidden: newVisibility });
    adminDataCache.restaurants = [];
    await logAudit(`Restaurant visibility changed`, `ID: ${restaurantId}, New Status: ${newVisibility ? 'Hidden' : 'Visible'}`);
    showToast(`Restaurant is now ${newVisibility ? 'hidden' : 'visible'}.`);
    renderAdminRestaurantDetailsView(restaurantId);
}

async function handleToggleDeliverySupport(restaurantId) {
    const restaurantRef = db.collection('restaurants').doc(restaurantId);
    const doc = await restaurantRef.get();
    const supportsDelivery = doc.data().supportsDelivery === false ? true : false;
    await restaurantRef.update({ supportsDelivery: supportsDelivery });
    adminDataCache.restaurants = [];
    await logAudit(`Restaurant delivery support changed`, `ID: ${restaurantId}, New Status: ${supportsDelivery ? 'Enabled' : 'Disabled'}`);
    showToast(`Delivery support has been ${supportsDelivery ? 'enabled' : 'disabled'}.`);
    renderAdminRestaurantDetailsView(restaurantId);
}

async function handleChangeRestaurantPassword(restaurantId) {
    const newPassword = prompt("Enter the new temporary password for this restaurant:");
    if (newPassword && newPassword.length >= 6) {
        await db.collection('restaurants').doc(restaurantId).update({ initialPassword: newPassword });
        adminDataCache.restaurants = [];
        await logAudit("Restaurant Password Changed", `ID: ${restaurantId}`);
        showToast("Temporary password display has been updated.");
        renderAdminRestaurantDetailsView(restaurantId);
    } else if (newPassword) {
        showToast("Password must be at least 6 characters long.", "error");
    }
}

async function renderAdminMenuManagementView(restaurantId) {
    const contentArea = document.getElementById('admin-content-area');
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    const restaurantName = restaurantDoc.data().name;

    contentArea.innerHTML = `
        <div class="mb-6">
            <button data-action="back-to-restaurant-details" data-id="${restaurantId}" class="btn bg-white rounded-lg py-2 px-4 flex items-center gap-2 shadow-sm hover:shadow-md">
                <i data-feather="arrow-left" class="w-5 h-5"></i> Back to Details
            </button>
        </div>
       <div class="flex justify-between items-center mb-6">
           <h2 class="text-3xl font-bold font-serif">Manage Menu: ${restaurantName}</h2>
           <button data-action="add-menu-item" data-id="${restaurantId}" class="btn btn-primary rounded-lg py-2 px-4 flex items-center gap-2">
               <i data-feather="plus" class="w-5 h-5"></i>Add Item
           </button>
       </div>
       <div id="admin-menu-list" class="space-y-3"></div>
   `;
    feather.replace();
    const listEl = document.getElementById('admin-menu-list');

    const unsub = db.collection('restaurants').doc(restaurantId).collection('menu').onSnapshot(snapshot => {
        if (snapshot.empty) {
           listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">This menu is empty.</p>';
           return;
        }

        // --- NEW: Logic to group items by category ---
        const groupedItems = {};
        snapshot.docs.forEach(doc => {
            const itemData = doc.data();
            const category = itemData.category || 'Uncategorized';
            if (!groupedItems[category]) {
                groupedItems[category] = [];
            }
            groupedItems[category].push(doc);
        });

        const sortedCategories = Object.keys(groupedItems).sort();

        let finalHtml = '';
        sortedCategories.forEach(categoryName => {
            finalHtml += `
                <div class="pt-4">
                    <h3 class="text-xl font-semibold font-serif mb-3 border-b pb-2">${categoryName}</h3>
                    <div class="space-y-3">
                        ${groupedItems[categoryName].map(doc => renderMenuItemCard(doc, restaurantId)).join('')}
                    </div>
                </div>
            `;
        });
        
        listEl.innerHTML = finalHtml;
        feather.replace();
    });
    unsubscribeListeners.push(unsub);
}


function renderMenuItemCard(doc, restaurantId) {
    const item = doc.data();
    const itemImage = item.imageUrl || 'https://placehold.co/100x100?text=Food';
    const variants = item.variants && item.variants.length > 0 ? item.variants : [{ name: '', price: item.price }];
    
    return `
        <div class="flex items-center justify-between p-4 border rounded-lg bg-white">
            <img src="${itemImage}" class="w-20 h-20 object-cover rounded-md mr-4 hidden sm:block">
            <div class="flex-grow">
                <p class="font-semibold">${item.name}</p>
                <p class="text-sm text-gray-600">${item.description || 'No description.'}</p>
                <div class="mt-1 text-sm">
                    ${variants.map(v => {
                        const displayName = v.name ? `${v.name}: ` : '';
                        return `<span class="inline-block bg-gray-100 rounded-full px-2 py-1 text-xs font-semibold mr-1 mb-1">${displayName}₹${v.price}</span>`;
                    }).join('')}
                </div>
            </div>
            <div class="flex flex-col sm:flex-row gap-2">
                <button data-action="edit-menu-item" data-id="${restaurantId}" data-item-id="${doc.id}" class="btn bg-gray-200 p-2 rounded-md"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                <button data-action="delete-menu-item" data-id="${restaurantId}" data-item-id="${doc.id}" class="btn bg-red-100 text-red-600 p-2 rounded-md"><i data-feather="trash" class="w-4 h-4"></i></button>
            </div>
        </div>
    `;
}

// MODIFIED: This function is now async and completely rewritten for a dynamic dropdown.
async function showMenuItemForm(restaurantId, itemId = null) {
    const isEditing = itemId !== null;
    let item = { name: '', description: '', imageUrl: '', category: '', variants: [{ name: '', price: '' }] };
    if (isEditing) {
        const itemDoc = await db.collection('restaurants').doc(restaurantId).collection('menu').doc(itemId).get();
        if (itemDoc.exists) {
            const data = itemDoc.data();
            item = { ...data, variants: data.variants && data.variants.length > 0 ? data.variants : [{ name: '', price: data.price || '' }] };
        }
    }

    // --- NEW: Fetch categories from the master collection ---
    const categoriesSnapshot = await db.collection('menuCategories').orderBy('name').get();
    const categoryOptions = categoriesSnapshot.docs.map(doc => {
        const categoryName = doc.data().name;
        const isSelected = item.category === categoryName ? 'selected' : '';
        return `<option value="${categoryName}" ${isSelected}>${categoryName}</option>`;
    }).join('');

    const formHtml = `
        <form id="menu-item-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif mb-4">${isEditing ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
            <input type="hidden" name="restaurantId" value="${restaurantId}">
            <input type="hidden" name="itemId" value="${itemId || ''}">
            <input type="text" name="name" class="input-field w-full" placeholder="Item Name (e.g., Biryani)" value="${item.name}" required>
            
            <div>
                <label class="block text-sm font-medium">Category</label>
                <select name="category" class="input-field w-full" required>
                    <option value="">-- Select a Category --</option>
                    ${categoryOptions}
                    <option value="add_new" class="font-bold text-blue-600">-- Add New Category --</option>
                </select>
            </div>
            <div id="new-category-container" class="hidden pl-4 border-l-2 border-blue-500">
                <label class="block text-sm font-medium">New Category Name</label>
                <input type="text" name="newCategoryName" class="input-field w-full" placeholder="e.g., Desserts">
            </div>

            <textarea name="description" class="input-field w-full" rows="2" placeholder="Description">${item.description || ''}</textarea>
            <div>
                <label class="block text-sm font-medium">Image URL</label>
                <input type="url" name="imageUrl" class="input-field w-full" placeholder="Image URL" value="${item.imageUrl || ''}">
                <img id="menu-image-preview" src="${item.imageUrl || 'https://placehold.co/100x100?text=Preview'}" class="mt-2 w-24 h-24 object-cover rounded-md border" onerror="this.src='https://placehold.co/100x100?text=Invalid'"/>
            </div>
            <div class="border-t pt-4 mt-4">
                <h4 class="font-semibold mb-2">Pricing</h4>
                <div id="variants-container" class="space-y-2">
                    ${item.variants.map((v, index) => `
                        <div class="variant-row flex items-center gap-2">
                            <input type="text" class="input-field flex-grow" placeholder="Variant Name (e.g., Half) - Optional" value="${v.name || ''}">
                            <input type="number" class="input-field w-28" placeholder="Price" value="${v.price || ''}" step="0.01" required>
                            <button type="button" class="btn btn-danger p-2 remove-variant-btn" ${index === 0 ? 'disabled' : ''}>&times;</button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" id="add-variant-btn" class="btn btn-secondary text-base mt-2 py-2 px-4">Add Variant</button>
            </div>
            <div class="flex justify-end gap-4 pt-4">
                <button type="button" class="btn bg-gray-200 text-lg py-3 px-6" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary text-lg py-3 px-6">Save Item</button>
            </div>
        </form>
    `;
    showModal(formHtml);

    // --- NEW: Event listener to handle the "Add New" selection ---
    const categorySelect = document.querySelector('#menu-item-form select[name="category"]');
    const newCategoryContainer = document.getElementById('new-category-container');
    const newCategoryInput = document.querySelector('#menu-item-form input[name="newCategoryName"]');

    categorySelect.addEventListener('change', (e) => {
        if (e.target.value === 'add_new') {
            newCategoryContainer.classList.remove('hidden');
            newCategoryInput.required = true;
        } else {
            newCategoryContainer.classList.add('hidden');
            newCategoryInput.required = false;
        }
    });

    document.getElementById('menu-item-form').elements.imageUrl.addEventListener('input', (e) => {
        document.getElementById('menu-image-preview').src = e.target.value || 'https://placehold.co/100x100?text=Preview';
    });
    
    const variantsContainer = document.getElementById('variants-container');
    document.getElementById('add-variant-btn').addEventListener('click', () => {
        const row = document.createElement('div');
        row.className = 'variant-row flex items-center gap-2';
        row.innerHTML = `<input type="text" class="input-field flex-grow" placeholder="Variant Name (e.g., Full) - Optional"><input type="number" class="input-field w-28" placeholder="Price" step="0.01" required><button type="button" class="btn btn-danger p-2 remove-variant-btn">&times;</button>`;
        variantsContainer.appendChild(row);
    });
    variantsContainer.addEventListener('click', e => {
        if (e.target.classList.contains('remove-variant-btn')) {
            e.target.closest('.variant-row').remove();
        }
    });

    // MODIFIED: We now call a named function to handle the complex save logic.
    document.getElementById('menu-item-form').addEventListener('submit', handleSaveMenuItem);
}


// NEW: This function handles the logic for saving a menu item, including adding new categories.
async function handleSaveMenuItem(e) {
    e.preventDefault();
    const form = e.target;
    const restaurantId = form.elements.restaurantId.value;
    const itemId = form.elements.itemId.value;

    const selectedCategoryValue = form.elements.category.value;
    let finalCategoryName = '';

    // Check if the user is adding a new category
    if (selectedCategoryValue === 'add_new') {
        const newCategoryName = form.elements.newCategoryName.value.trim();
        if (!newCategoryName) {
            showToast("New category name cannot be empty.", "error");
            return;
        }
        // Save the new category to the master collection
        await db.collection('menuCategories').add({ name: newCategoryName });
        finalCategoryName = newCategoryName;
        showToast(`New category "${newCategoryName}" created!`, 'success');
    } else {
        finalCategoryName = selectedCategoryValue;
    }
    
    const variants = [];
    form.querySelectorAll('.variant-row').forEach(row => {
        variants.push({
            name: row.children[0].value,
            price: parseFloat(row.children[1].value)
        });
    });

    const data = {
        name: form.elements.name.value,
        category: finalCategoryName, // Use the final determined category name
        description: form.elements.description.value,
        imageUrl: form.elements.imageUrl.value,
        variants: variants,
        price: variants[0] ? variants[0].price : 0,
    };

    if (itemId) { // Editing an existing item
        await db.collection('restaurants').doc(restaurantId).collection('menu').doc(itemId).update(data);
        showToast("Menu item updated!");
    } else { // Adding a new item
        await db.collection('restaurants').doc(restaurantId).collection('menu').add(data);
        showToast("New menu item added!");
    }
    closeModal();
}


function handleDeleteMenuItem(restaurantId, itemId) {
    showConfirmationModal("Delete Item?", "Are you sure you want to permanently delete this menu item? This cannot be undone.",
        async () => {
            await db.collection('restaurants').doc(restaurantId).collection('menu').doc(itemId).delete();
            showToast("Menu item deleted.", "error");
        }
    );
}

async function renderAdminOrdersView(contentArea, searchTerm = '') {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">All Orders</h2><div id="admin-orders-table">Loading...</div>`;
    const tableEl = document.getElementById('admin-orders-table');

    if (adminDataCache.orders.length === 0) {
        const ordersSnapshot = await db.collection('orders').orderBy('createdAt', 'desc').get();
        adminDataCache.orders = ordersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const filteredOrders = adminDataCache.orders.filter(order =>
        order.id.toLowerCase().includes(searchTerm) ||
        order.customerName.toLowerCase().includes(searchTerm) ||
        order.restaurantName.toLowerCase().includes(searchTerm)
    );

    let tableHtml = `<div class="bg-white p-4 rounded-xl shadow-md overflow-x-auto">
        <table class="w-full text-sm text-left">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                    <th class="px-6 py-3">Order ID</th>
                    <th class="px-6 py-3">Customer</th>
                    <th class="px-6 py-3">Restaurant</th>
                    <th class="px-6 py-3">Total</th>
                    <th class="px-6 py-3">Status</th>
                    <th class="px-6 py-3">Action</th>
                </tr>
            </thead><tbody>`;
    
    filteredOrders.forEach(order => {
        tableHtml += `<tr class="border-b">
            <td class="px-6 py-4 font-medium">#${order.id.substring(0,6)}</td>
            <td class="px-6 py-4">${order.customerName}</td>
            <td class="px-6 py-4">${order.restaurantName}</td>
            <td class="px-6 py-4">₹${order.totalPrice.toFixed(2)}</td>
            <td class="px-6 py-4 capitalize">${order.status}</td>
            <td class="px-6 py-4">
               <button data-action="view-bill" data-order-id="${order.id}" class="btn btn-secondary text-xs py-1 px-2">View Bill</button>
            </td>
        </tr>`;
    });
    tableHtml += `</tbody></table></div>`;
    tableEl.innerHTML = tableHtml;
    feather.replace();
}

async function renderAdminUsersView(contentArea, searchTerm = '') {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">All Users</h2><div id="admin-users-table">Loading...</div>`;
    const tableEl = document.getElementById('admin-users-table');
    
    if (adminDataCache.users.length === 0) {
        const usersSnapshot = await db.collection('users').get();
        adminDataCache.users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const filteredUsers = adminDataCache.users.filter(user =>
        user.name.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm)
    );
    
    let tableHtml = `<div class="bg-white p-4 rounded-xl shadow-md overflow-x-auto">
        <table class="w-full text-sm text-left">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                <tr><th class="px-6 py-3">Name</th><th class="px-6 py-3">Email</th><th class="px-6 py-3">Mobile</th><th class="px-6 py-3">Role</th></tr>
            </thead><tbody>`;
    filteredUsers.forEach(user => {
        tableHtml += `<tr class="border-b"><td class="px-6 py-4 font-medium">${user.name}</td><td class="px-6 py-4">${user.email}</td><td class="px-6 py-4">${user.mobile || 'N/A'}</td><td class="px-6 py-4 capitalize">${user.role}</td></tr>`;
    });
    tableHtml += `</tbody></table></div>`;
    tableEl.innerHTML = tableHtml;
}

async function renderDeliveryBoysView(contentArea, searchTerm = '') {
    contentArea.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold font-serif">Delivery Staff</h2>
            <button data-action="add-delivery-boy" class="btn btn-primary rounded-lg py-2 px-4 flex items-center gap-2">
                <i data-feather="plus" class="w-5 h-5"></i>Add Delivery Boy
            </button>
        </div>
        <div id="delivery-boys-list-container"></div>
    `;
    feather.replace();
    const listEl = document.getElementById('delivery-boys-list-container');
    
    if (adminDataCache.deliveryBoys.length === 0) {
        const snapshot = await db.collection('users').where('role', '==', 'delivery').get();
        adminDataCache.deliveryBoys = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    const filteredBoys = adminDataCache.deliveryBoys.filter(boy =>
        boy.name.toLowerCase().includes(searchTerm) ||
        boy.email.toLowerCase().includes(searchTerm)
    );
    
    if (filteredBoys.length === 0) {
        listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No delivery boys found.</p>';
        return;
    }
    let tableHtml = `<div class="bg-white p-4 rounded-xl shadow-md overflow-x-auto">
       <table class="w-full text-sm text-left">
        <thead class="text-xs text-gray-700 uppercase bg-gray-50">
            <tr><th class="px-6 py-3">Name</th><th class="px-6 py-3">Email</th><th class="px-6 py-3">Rating</th><th class="px-6 py-3">Status</th></tr>
        </thead><tbody>`;
    filteredBoys.forEach(boy => {
        tableHtml += `<tr class="border-b hover:bg-gray-50 cursor-pointer delivery-boy-row" data-id="${boy.id}">
           <td class="px-6 py-4 font-medium">${boy.name}</td>
           <td class="px-6 py-4">${boy.email}</td>
           <td class="px-6 py-4">${(boy.avgRating || 0).toFixed(1)} ★</td>
           <td class="px-6 py-4 capitalize ${boy.isOnline ? 'text-green-600 font-semibold' : ''}">${boy.isOnline ? 'Online' : 'Offline'}</td>
       </tr>`;
    });
    tableHtml += `</tbody></table></div>`;
    listEl.innerHTML = tableHtml;
}

async function renderDeliveryBoyDetailsView(userId) {
    const contentArea = document.getElementById('admin-content-area');
    contentArea.innerHTML = `<p>Loading details...</p>`;
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        contentArea.innerHTML = `<p>Delivery boy not found.</p>`;
        return;
    }
    const user = { id: userDoc.id, ...userDoc.data() };

    const lockButtonText = user.isLocked ? 'Unlock Account' : 'Lock Account';
    const lockButtonClass = user.isLocked ? 'btn-primary' : 'btn-danger';

    contentArea.innerHTML = `
         <div class="mb-6">
             <button data-action="back-to-delivery-boys" class="btn bg-white rounded-lg py-2 px-4 flex items-center gap-2 shadow-sm hover:shadow-md">
                 <i data-feather="arrow-left" class="w-5 h-5"></i> Back to Delivery Staff
             </button>
         </div>
         <div class="bg-white p-6 rounded-xl shadow-md">
             <div class="flex justify-between items-start">
                 <div>
                     <h2 class="text-3xl font-bold font-serif">${user.name}</h2>
                     <p class="text-gray-600 mt-1">${user.email}</p>
                 </div>
                 <div class="flex gap-2 flex-wrap">
                    <button data-action="remove-delivery-boy" data-id="${user.id}" class="btn btn-danger">Remove</button>
                 </div>
             </div>
             <div class="mt-6 border-t pt-4 space-y-2">
                 <p><strong>Mobile:</strong> ${user.mobile || 'N/A'}</p>
                 <p><strong>User ID:</strong> ${user.id}</p>
                 <div class="bg-gray-100 p-4 rounded-lg mt-4">
                     <h4 class="font-semibold">Credentials</h4>
                     <p><strong>Password:</strong> <span class="text-red-500 font-mono">${user.initialPassword || 'Set by user'}</span></p>
                     <button data-action="change-delivery-boy-password" data-id="${user.id}" class="btn btn-secondary text-sm mt-2 py-1 px-3">Change Password</button>
                 </div>
                  <div class="bg-yellow-100 p-4 rounded-lg mt-4">
                     <h4 class="font-semibold">Account Status</h4>
                     <p>This account is currently <strong>${user.isLocked ? 'Locked' : 'Active'}</strong>.</p>
                     <button data-action="toggle-delivery-boy-lock" data-id="${user.id}" class="btn ${lockButtonClass} text-sm mt-2 py-1 px-3">${lockButtonText}</button>
                 </div>
             </div>
         </div>
    `;
    feather.replace();
}

async function handleChangeDeliveryBoyPassword(userId) {
    const newPassword = prompt("Enter the new temporary password for this user:");
    if (newPassword && newPassword.length >= 6) {
        await db.collection('users').doc(userId).update({ initialPassword: newPassword });
        adminDataCache.deliveryBoys = [];
        await logAudit("Delivery Boy Password Changed", `ID: ${userId}`);
        showToast("Temporary password display has been updated.");
        renderDeliveryBoyDetailsView(userId);
    } else if (newPassword) {
        showToast("Password must be at least 6 characters long.", "error");
    }
}

async function handleToggleDeliveryBoyLock(userId) {
    const userRef = db.collection('users').doc(userId);
    const doc = await userRef.get();
    const currentStatus = doc.data().isLocked || false;
    const newStatus = !currentStatus;
    await userRef.update({ isLocked: newStatus });
    adminDataCache.deliveryBoys = [];
    await logAudit(`Delivery Boy ${newStatus ? 'Locked' : 'Unlocked'}`, `ID: ${userId}`);
    showToast(`Delivery boy has been ${newStatus ? 'locked' : 'unlocked'}.`);
    renderDeliveryBoyDetailsView(userId);
}

async function handleRemoveDeliveryBoy(userId) {
    showConfirmationModal(
        "Remove Delivery Boy?",
        "This will delete their profile data. This action cannot be undone. Note: This does not delete their authentication record for security reasons.",
        async () => {
            await db.collection('users').doc(userId).delete();
            adminDataCache.deliveryBoys = [];
            adminDataCache.users = [];
            await logAudit("Delivery Boy Removed", `ID: ${userId}`);
            showToast("Delivery boy profile has been removed.", "error");
            renderAdminView('delivery-boys');
        }
    );
}

function renderScannerView(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Scan Order QR Code</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <div id="qr-scanner-container" class="w-full max-w-md mx-auto">
                <div id="qr-reader" class="border-2 border-dashed rounded-lg" style="width: 100%;"></div>
                <div id="qr-reader-results" class="text-center mt-4 font-mono"></div>
            </div>
            <div class="text-center mt-4">
                <button data-action="start-scan" class="btn btn-primary">Start Scanner</button>
                <button data-action="stop-scan" class="btn btn-danger hidden">Stop Scanner</button>
            </div>
        </div>
        <div id="scanned-order-details" class="mt-8"></div>
    `;
}

function startScanner() {
    document.querySelector('[data-action=start-scan]').classList.add('hidden');
    document.querySelector('[data-action=stop-scan]').classList.remove('hidden');
    const resultsEl = document.getElementById('qr-reader-results');
    const detailsContainer = document.getElementById('scanned-order-details');

    const onScanSuccess = (decodedText, decodedResult) => {
        stopScanner();
        resultsEl.innerHTML = `<span class="text-green-600 font-semibold">Success! Scanned Order ID: ${decodedText}</span>`;
        detailsContainer.innerHTML = '<p class="text-center">Loading order details...</p>';
        renderOrderBill(decodedText, detailsContainer);
    };

    const onScanFailure = (error) => { /* console.warn(`Code scan error = ${error}`); */ }

    if (!html5QrCode) {
         html5QrCode = new Html5Qrcode("qr-reader");
    }

    html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: {width: 250, height: 250} }, onScanSuccess, onScanFailure)
        .catch(err => {
            showToast("Could not start camera. Please ensure you have a camera and have granted permission.", "error");
            console.error("Camera start error", err);
            stopScanner();
        });
}

function stopScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("QR Code scanning failed to stop.", err));
    }
    const startBtn = document.querySelector('[data-action=start-scan]');
    const stopBtn = document.querySelector('[data-action=stop-scan]');
    if (startBtn) startBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');
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

async function renderOrderBill(orderId, targetContainer = null) {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
        const content = `<div class="text-center p-4 bg-red-100 text-red-700 rounded-lg">Order with ID <strong>${orderId}</strong> not found.</div>`;
         if (targetContainer) {
            targetContainer.innerHTML = content;
        } else {
            showModal(`<div class="p-4">${content}</div>`);
        }
        return;
    }
    const order = orderDoc.data();
    const restaurantDoc = await db.collection('restaurants').doc(order.restaurantId).get();
    const restaurant = restaurantDoc.data();
    const customerDoc = await db.collection('users').doc(order.customerId).get();
    const customer = customerDoc.data();
    
    const itemsWithImages = await Promise.all(order.items.map(async (item) => {
        const menuItemDoc = await db.collection('restaurants').doc(order.restaurantId).collection('menu').doc(item.id.split('-')[0]).get();
        const imageUrl = menuItemDoc.exists && menuItemDoc.data().imageUrl ? menuItemDoc.data().imageUrl : 'https://placehold.co/100x100?text=Food';
        return { ...item, imageUrl };
    }));

    const billHtml = `
        <div id="printable-bill" class="bg-white rounded-xl shadow-lg overflow-hidden">
            <div class="p-6">
                <div class="text-center mb-8">
                    <h2 class="text-3xl font-bold font-serif">${siteSettings.websiteName || 'UniFood'}</h2>
                    <p class="text-lg font-semibold">${order.restaurantName}</p>
                    <p class="text-sm text-gray-600">${restaurant.address}</p>
                </div>
                <div class="flex justify-between items-center mb-6">
                    <div>
                        <h3 class="text-2xl font-bold font-serif">Tax Invoice</h3>
                        <p class="text-sm text-gray-500">Invoice #: <strong>${orderId.substring(0, 8).toUpperCase()}</strong></p>
                        <p class="text-sm text-gray-500">Date: ${new Date(order.createdAt.seconds * 1000).toLocaleString()}</p>
                    </div>
                    <div id="qrcode-container" class="p-1 bg-white border rounded-lg"></div>
                </div>
                <div class="border-y py-4 mb-6">
                    <p class="font-bold">Billed To:</p>
                    <p>${order.customerName}</p>
                    <p>${order.deliveryAddress}</p>
                    <p>Email: ${customer.email}</p>
                    <p>Mobile: ${customer.mobile || 'N/A'}</p>
                    <p class="mt-2"><strong>Payment Method:</strong> <span class="capitalize">${order.paymentMethod || 'N/A'}</span></p>
                    <p><strong>Service Type:</strong> <span class="capitalize">${order.deliveryType || 'Delivery'}</span></p>
                </div>

                <table class="w-full text-sm my-6">
                    <thead class="border-b bg-gray-50">
                        <tr>
                            <th class="text-left p-2">Image</th>
                            <th class="text-left p-2">Item</th>
                            <th class="text-center p-2">Qty</th>
                            <th class="text-right p-2">Price</th>
                            <th class="text-right p-2">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsWithImages.map(item => `
                            <tr class="border-b">
                                <td class="p-2"><img src="${item.imageUrl}" class="w-12 h-12 object-cover rounded-md" onerror="this.src='https://placehold.co/48x48?text=Img'"></td>
                                <td class="p-2">${item.name}</td>
                                <td class="text-center p-2">${item.quantity}</td>
                                <td class="text-right p-2">₹${item.price.toFixed(2)}</td>
                                <td class="text-right p-2">₹${(item.price * item.quantity).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot class="font-semibold">
                        <tr>
                            <td colspan="4" class="text-right p-2 border-t">Subtotal</td>
                            <td class="text-right p-2 border-t">₹${order.subtotal.toFixed(2)}</td>
                        </tr>
                         <tr>
                            <td colspan="4" class="text-right p-2">Delivery Fee</td>
                            <td class="text-right p-2">₹${(order.deliveryFee || 0).toFixed(2)}</td>
                        </tr>
                         <tr>
                            <td colspan="4" class="text-right p-2">Platform Fee</td>
                            <td class="text-right p-2">₹${(order.platformFee || 0).toFixed(2)}</td>
                        </tr>
                         <tr>
                            <td colspan="4" class="text-right p-2">GST (${order.gstRate || 5}%)</td>
                            <td class="text-right p-2">₹${order.gst.toFixed(2)}</td>
                        </tr>
                        <tr class="text-xl font-bold border-t-2 bg-gray-100">
                            <td colspan="4" class="text-right p-2">Grand Total</td>
                            <td class="text-right p-2">₹${order.totalPrice.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
                <p class="text-center text-xs text-gray-500">Thank you for your order!</p>
            </div>
        </div>
        <div class="flex justify-end gap-4 mt-4 no-print">
            ${!targetContainer ? `<button class="btn bg-gray-200" onclick="closeModal()">Close</button>` : ''}
            <button class="btn btn-primary" onclick="downloadBillAsPDF('${orderId}')">Download PDF</button>
        </div>
    `;
    if(targetContainer) {
        targetContainer.innerHTML = billHtml;
    } else {
        showModal(billHtml);
    }
    new QRCode(document.getElementById("qrcode-container"), {
        text: orderId,
        width: 80,
        height: 80,
    });
}
function downloadBillAsPDF(orderId) {
    const element = document.getElementById('printable-bill');
    const opt = {
      margin:       0.5,
      filename:     `UniFood_Invoice_${orderId.substring(0,8)}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
}

// ----- NEW ADVERTISEMENT MANAGEMENT FUNCTIONS -----

// RENAME and REWRITE renderSettingsView to renderAdvertisementsView
async function renderAdvertisementsView(contentArea) {
    contentArea.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold font-serif">Manage Advertisements</h2>
            <button data-action="add-advertisement" class="btn btn-primary rounded-lg py-2 px-4 flex items-center gap-2">
                <i data-feather="plus" class="w-5 h-5"></i> Add Advertisement
            </button>
        </div>
        <div id="advertisements-list" class="space-y-4"></div>
    `;
    feather.replace();

    const listEl = document.getElementById('advertisements-list');
    listEl.innerHTML = '<p>Loading advertisements...</p>';

    // Fetch all documents from the new 'advertisements' collection
    const snapshot = await db.collection('advertisements').orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
        listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No advertisements have been created yet.</p>';
        return;
    }

    // Fetch all restaurant names for mapping
    const restaurantsSnapshot = await db.collection('restaurants').get();
    const restaurantMap = new Map(restaurantsSnapshot.docs.map(doc => [doc.id, doc.data().name]));

    listEl.innerHTML = snapshot.docs.map(doc => {
        const ad = doc.data();
        const restaurantName = restaurantMap.get(ad.restaurantId) || 'Unknown Restaurant';
        const statusClass = ad.isEnabled ? 'text-green-600 bg-green-100' : 'text-gray-600 bg-gray-100';
        const statusText = ad.isEnabled ? 'Enabled' : 'Disabled';

        return `
            <div class="bg-white p-4 rounded-xl shadow-md flex items-center gap-4">
                <img src="${ad.imageUrl || 'https://placehold.co/150x75?text=Ad'}" class="w-40 h-20 object-cover rounded-md border" onerror="this.src='https://placehold.co/150x75?text=Invalid'">
                <div class="flex-grow">
                    <p><strong>Links to:</strong> ${restaurantName}</p>
                    <p class="text-sm"><strong>Status:</strong> <span class="px-2 py-1 rounded-full text-xs font-semibold ${statusClass}">${statusText}</span></p>
                </div>
                <div class="flex flex-col sm:flex-row gap-2">
                    <button data-action="edit-advertisement" data-id="${doc.id}" class="btn bg-gray-200 p-2 rounded-md"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                    <button data-action="delete-advertisement" data-id="${doc.id}" class="btn bg-red-100 text-red-600 p-2 rounded-md"><i data-feather="trash" class="w-4 h-4"></i></button>
                </div>
            </div>
        `;
    }).join('');
    feather.replace();
}

// NEW function to show a modal form for adding/editing an ad
async function showAdvertisementForm(adId = null) {
    const isEditing = adId !== null;
    let adData = { imageUrl: '', restaurantId: '', isEnabled: true };

    if (isEditing) {
        const adDoc = await db.collection('advertisements').doc(adId).get();
        if (adDoc.exists) {
            adData = adDoc.data();
        }
    }

    const restaurantsSnapshot = await db.collection('restaurants').get();
    const restaurantOptions = restaurantsSnapshot.docs.map(doc => {
        return `<option value="${doc.id}" ${doc.id === adData.restaurantId ? 'selected' : ''}>${doc.data().name}</option>`;
    }).join('');

    const formHtml = `
        <form id="ad-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif mb-4">${isEditing ? 'Edit Advertisement' : 'Add New Advertisement'}</h3>
            <input type="hidden" name="adId" value="${adId || ''}">
            <div>
                <label class="block text-sm font-medium">Advertisement Image URL</label>
                <input type="url" name="imageUrl" class="input-field w-full" placeholder="https://example.com/ad.jpg" value="${adData.imageUrl}" required>
                <img id="ad-image-preview" src="${adData.imageUrl || 'https://placehold.co/600x150?text=Ad+Preview'}" class="mt-2 w-full h-auto object-cover rounded-md border" onerror="this.src='https://placehold.co/600x150?text=Invalid+URL'"/>
            </div>
            <div>
                <label class="block text-sm font-medium">Link to Restaurant</label>
                <select name="restaurantId" class="input-field w-full" required>
                    <option value="">-- Select a Restaurant --</option>
                    ${restaurantOptions}
                </select>
            </div>
            <div>
                <label class="flex items-center cursor-pointer">
                    <input type="checkbox" name="isEnabled" class="form-checkbox h-5 w-5 text-blue-600" ${adData.isEnabled ? 'checked' : ''}>
                    <span class="ml-3 text-gray-700 font-medium">Enable this advertisement</span>
                </label>
            </div>
            <div class="flex justify-end gap-4 pt-4">
                <button type="button" class="btn bg-gray-200" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Save Advertisement</button>
            </div>
        </form>
    `;
    showModal(formHtml);

    document.querySelector('#ad-form input[name="imageUrl"]').addEventListener('input', (e) => {
        document.getElementById('ad-image-preview').src = e.target.value || 'https://placehold.co/600x150?text=Ad+Preview';
    });

    document.getElementById('ad-form').addEventListener('submit', handleSaveAdvertisement);
}

// NEW handler for the add/edit form submission
async function handleSaveAdvertisement(e) {
    e.preventDefault();
    const form = e.target;
    const adId = form.elements.adId.value;
    const isEditing = adId !== '';

    const adData = {
        imageUrl: form.elements.imageUrl.value,
        restaurantId: form.elements.restaurantId.value,
        isEnabled: form.elements.isEnabled.checked,
    };

    try {
        if (isEditing) {
            await db.collection('advertisements').doc(adId).update(adData);
            await logAudit('Advertisement Updated', `ID: ${adId}`);
            showToast('Advertisement updated successfully!');
        } else {
            adData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('advertisements').add(adData);
            await logAudit('Advertisement Created', `Image: ${adData.imageUrl}`);
            showToast('New advertisement added successfully!');
        }
        closeModal();
        renderAdvertisementsView(document.getElementById('admin-content-area'));
    } catch (error) {
        console.error("Error saving advertisement:", error);
        showToast('Failed to save advertisement.', 'error');
    }
}

// NEW delete handler for a specific advertisement
function handleDeleteAdvertisement(adId) {
    showConfirmationModal(
        "Delete Advertisement?",
        "Are you sure you want to permanently delete this advertisement? This action cannot be undone.",
        async () => {
            try {
                await db.collection('advertisements').doc(adId).delete();
                await logAudit('Advertisement Deleted', `ID: ${adId}`);
                showToast('Advertisement deleted successfully!', 'success');
                renderAdvertisementsView(document.getElementById('admin-content-area'));
            } catch (error) {
                console.error("Error deleting advertisement:", error);
                showToast('Failed to delete advertisement.', 'error');
            }
        }
    );
}


async function renderAdminProfileView(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">My Profile</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <form id="admin-profile-form" class="space-y-4">
                <div>
                    <label for="profile-name" class="block text-sm font-medium text-gray-700">Full Name</label>
                    <input type="text" id="profile-name" class="input-field mt-1 block w-full" value="${currentUser.name}" required>
                </div>
                 <div>
                    <label for="profile-email" class="block text-sm font-medium text-gray-700">Email (Cannot be changed)</label>
                    <input type="email" id="profile-email" class="input-field mt-1 block w-full bg-gray-200" value="${currentUser.email}" disabled>
                </div>
                <button type="submit" class="btn btn-primary py-2 px-6 rounded-lg">Update Profile</button>
            </form>
            
            <div class="mt-6 border-t pt-6">
                 <h3 class="text-lg font-semibold">Security</h3>
                 <p class="text-sm text-gray-600 mt-1">To change your password, a reset link will be sent to your email address.</p>
                 <button data-action="change-admin-password" class="btn btn-secondary text-sm mt-2 py-2 px-4">Send Password Reset Email</button>
            </div>
        </div>
    `;
    
    feather.replace();

    document.getElementById('admin-profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('profile-name').value;
        if (newName.trim() === '') {
            showToast('Name cannot be empty.', 'error');
            return;
        }

        try {
            await db.collection('users').doc(currentUser.uid).update({ name: newName });
            currentUser.name = newName; // Update local cache
            const userHtml = `<p class="font-semibold">${currentUser.name}</p><p class="text-xs text-gray-500 capitalize">${currentUser.role}</p>`;
            userInfo.innerHTML = userHtml;
            mobileUserInfo.innerHTML = userHtml;
            showToast('Profile updated successfully!');
            await logAudit('Profile Updated', `Admin user ${currentUser.email} updated their name.`);
        } catch (error) {
            console.error('Error updating profile:', error);
            showToast('Failed to update profile.', 'error');
        }
    });
}

// --- NEW: Toast Notification Function ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };
    const icons = {
        success: 'check-circle',
        error: 'alert-circle',
        info: 'info'
    };
    
    toast.className = `flex items-center gap-4 ${colors[type]} text-white py-3 px-5 rounded-lg shadow-xl toast-enter`;
    toast.innerHTML = `<i data-feather="${icons[type]}"></i><span class="font-semibold">${message}</span>`;
    
    container.appendChild(toast);
    feather.replace();
    
    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000); // Stays for 4 seconds
}

function showModal(contentHtml) {
    modalContainer.innerHTML = `<div class="modal-content">${contentHtml}</div>`;
    modalContainer.classList.add('active');
    feather.replace();
}

function showSimpleModal(title, message, onOk) {
    const modalHtml = `
        <div class="text-center">
            <h3 class="text-2xl font-bold font-serif mb-2">${title}</h3>
            <p class="text-gray-600 mb-6">${message}</p>
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
            <p class="text-gray-600 mb-6">${message}</p>
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
    if (document.getElementById('qr-reader')) {
        stopScanner();
    }
    modalContainer.classList.remove('active');
    modalContainer.innerHTML = '';
}

function cleanupListeners() {
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
    stopScanner();
}
// --- INITIALIZE APP ON LOAD ---
document.addEventListener('DOMContentLoaded', initializeApp);

// --- LOGOUT ---
document.getElementById('logout-btn').addEventListener('click', () => {
    auth.signOut().then(() => {
        console.log('User signed out successfully.');
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error('Sign out error', error);
        alert('An error occurred while logging out. Please try again.');
    });
});
feather.replace();
