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

// --- IMAGE UPLOAD CONFIGURATION ---
const IMGBB_API_KEY = "62a280e0202a328a0b3663fe3b7c6104"; // IMPORTANT: Replace with your actual ImgBB API key

// --- GLOBAL STATE & EVENT HANDLERS ---
let currentUser = null;
let unsubscribeListeners = [];
let activePortalHandler = null;
let siteSettings = {};
let charts = {}; // To hold Chart.js instances
const notificationSound = new Audio('https://cdn.jsdelivr.net/npm/ion-sound@3.0.7/sounds/bell_ring.mp3');


// --- UI REFERENCES ---
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const mainContent = document.getElementById('main-content');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const modalContainer = document.getElementById('modal-container');
const websiteNameHeader = document.getElementById('website-name-header');
const websiteLogoHeader = document.getElementById('website-logo-header');
const announcementContainer = document.getElementById('announcement-banner-container');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
const mobileMenu = document.getElementById('mobile-menu');
const closeMobileMenuButton = document.getElementById('close-mobile-menu');
const mobileUserInfo = document.getElementById('mobile-user-info');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

// --- IMAGE UPLOAD UTILITY ---
async function uploadImageToImgBB(file) {
    if (!IMGBB_API_KEY || IMGBB_API_KEY === "YOUR_IMGBB_API_KEY") {
        showToast("ImgBB API key is not configured.", "error");
        throw new Error("ImgBB API key is missing.");
    }
    const formData = new FormData();
    formData.append("image", file);

    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: "POST",
            body: formData,
        });
        const data = await response.json();
        if (data.success) {
            return data.data.url;
        } else {
            throw new Error(data.error.message || "Image upload failed.");
        }
    } catch (error) {
        console.error("ImgBB Upload Error:", error);
        throw error;
    }
}

function handleImageUpload(e, urlInput, loader) {
    const file = e.target.files[0];
    if (!file) return;

    loader.style.display = 'block';
    
    uploadImageToImgBB(file)
        .then(url => {
            if (urlInput.tagName.toLowerCase() === 'textarea') {
                urlInput.value = (urlInput.value ? urlInput.value + '\n' : '') + url;
            } else {
                urlInput.value = url;
            }
            urlInput.dispatchEvent(new Event('input')); 
            showToast("Image uploaded successfully!", "success");
        })
        .catch(err => {
            showToast(`Upload failed: ${err.message}`, "error");
        })
        .finally(() => {
            loader.style.display = 'none';
            e.target.value = ''; 
        });
}

// --- CORE APP & AUTH LOGIC ---
async function initializeApp() {
    const settingsDoc = await db.collection('settings').doc('config').get();
    if (settingsDoc.exists) siteSettings = settingsDoc.data();
    applySiteSettings();

    auth.onAuthStateChanged(async (user) => {
        cleanupListeners();
        if (activePortalHandler) document.body.removeEventListener('click', activePortalHandler);
        
        if (user) {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists && userDoc.data().role === 'restaurant') {
                currentUser = { uid: user.uid, ...userDoc.data() };
                const restaurantDoc = await db.collection('restaurants').doc(currentUser.restaurantId).get();
                if (restaurantDoc.exists && restaurantDoc.data().isLocked) {
                    showSimpleModal("Account Locked", "Your account is locked. Please contact support.");
                    auth.signOut();
                    return;
                }
                const userHtml = `<p class="font-semibold">${currentUser.name}</p><p class="text-xs text-gray-500 capitalize">${currentUser.role}</p>`;
                userInfo.innerHTML = userHtml;
                mobileUserInfo.innerHTML = userHtml;
                showView('app');
                loadPortal(currentUser);

                const settingsListener = db.collection('settings').doc('config').onSnapshot(doc => {
                    console.log("Restaurant Panel: Real-time settings received!");
                    if (doc.exists) {
                        siteSettings = doc.data();
                        applySiteSettings();
                    }
                });
                unsubscribeListeners.push(settingsListener);

            } else {
                showSimpleModal("Access Denied", "You do not have permission to access this panel.", () => auth.signOut());
            }
        } else {
            currentUser = null;
            showView('auth');
        }
    });
}

function applySiteSettings() {
    const theme = siteSettings.theme || {};
    const globalTheme = theme.global || {};
    if (siteSettings.websiteName) {
        websiteNameHeader.textContent = siteSettings.websiteName;
        document.title = `${siteSettings.websiteName} - Restaurant Panel`;
    }
    if (siteSettings.logoUrl) websiteLogoHeader.src = siteSettings.logoUrl;
    document.documentElement.style.setProperty('--primary-color', globalTheme.primaryColor || '#1a202c');
    document.documentElement.style.setProperty('--secondary-color', globalTheme.secondaryColor || '#D4AF37');
}

function showView(view) {
    const header = document.querySelector('header');
    if (view === 'app') {
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        header.style.display = 'flex';
        appContainer.classList.add('fade-in');
    } else {
        appContainer.style.display = 'none';
        header.style.display = 'none';
        authContainer.style.display = 'flex';
        renderAuthForm('login');
    }
}

function loadPortal(user) {
    mainContent.innerHTML = '';
    const template = document.getElementById(`${user.role}-portal-template`);
    if (template) {
        mainContent.appendChild(template.content.cloneNode(true));
        const desktopNav = document.getElementById('restaurant-nav');
        const mobileNavContainer = document.getElementById('mobile-nav-container');
        if(desktopNav && mobileNavContainer) {
            const mobileNavClone = desktopNav.cloneNode(true);
            mobileNavClone.id = 'mobile-sidebar-nav';
            mobileNavClone.addEventListener('click', (e) => {
                if(e.target.closest('.sidebar-link')) closeMobileMenu();
            });
            mobileNavContainer.appendChild(mobileNavClone);
        }
        feather.replace();
        initializeRestaurantPortal();
    } else {
        mainContent.innerHTML = `<p class="text-center text-red-500">Error: Portal template not found.</p>`;
    }
}

function renderAuthForm(formType) {
    const authCard = authContainer.querySelector('.auth-card');
    authCard.innerHTML = '';
    const template = document.getElementById(`${formType}-form-template`);
    if (template) {
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
        .catch(err => { errorEl.textContent = 'Invalid credentials. Please try again.'; });
}

// --- RESTAURANT PORTAL ---
function initializeRestaurantPortal() {
    activePortalHandler = handleRestaurantClicks;
    document.body.addEventListener('click', activePortalHandler);
    listenForNewOrders();
    renderRestaurantView('dashboard');
}

function listenForNewOrders() {
    let isInitialLoad = true;
    const query = db.collection('orders')
        .where('restaurantId', '==', currentUser.restaurantId)
        .where('status', '==', 'placed');

    const unsub = query.onSnapshot(snapshot => {
        if (isInitialLoad) {
            isInitialLoad = false;
            return; 
        }
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
                notificationSound.play().catch(e => {
                    console.error("Audio playback failed:", e);
                    showToast("New order received! (Sound may be blocked by browser)", "info");
                });
                showToast(`New Order #${change.doc.id.substring(0,6)} Received!`, 'info');
            }
        });
    }, error => {
        console.error("Error with new order listener:", error);
    });
    unsubscribeListeners.push(unsub);
}


function handleRestaurantClicks(e) {
    const navLink = e.target.closest('[data-view]');
    if (navLink) {
        e.preventDefault();
        renderRestaurantView(navLink.dataset.view);
        return;
    }

    const actionButton = e.target.closest('[data-action]');
    if(actionButton) {
        e.preventDefault();
        const { action, orderId, itemId, newStatus } = actionButton.dataset;
        switch(action) {
            case 'accept-order': acceptOrder(orderId); break;
            case 'deny-order': denyOrder(orderId); break;
            case 'add-menu-item': showMenuItemForm(); break;
            case 'edit-menu-item': showMenuItemForm(itemId); break;
            case 'delete-menu-item': handleDeleteMenuItem(itemId); break;
            case 'view-bill': renderOrderBill(orderId); break;
            case 'change-status': changeOrderStatus(orderId, newStatus); break;
            case 'mark-as-paid': markPaymentAsPaid(orderId); break;
            case 'download-report': downloadOrderReport(); break;
            case 'change-password':
                 showConfirmationModal('Change Password?', 'A password reset link will be sent to your email.', () => {
                    auth.sendPasswordResetEmail(currentUser.email)
                        .then(() => showSimpleModal('Email Sent', 'Password reset email sent.'))
                        .catch(err => showSimpleModal('Error', err.message));
                });
                break;
        }
    }
}

function renderRestaurantView(viewName) {
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === viewName);
    });
    const contentArea = document.getElementById('restaurant-main-content');
    if (!contentArea) return;
    
    switch(viewName) {
        case 'dashboard': renderRestaurantDashboard(contentArea); break;
        case 'orders': renderRestaurantOrders(contentArea); break;
        case 'menu': renderRestaurantMenu(contentArea); break;
        case 'reviews': renderMyReviews(contentArea); break;
        case 'profile': renderRestaurantProfile(contentArea); break;
    }
}

// --- NEW: Dashboard Analytics & Charts ---

function destroyCharts() {
    Object.values(charts).forEach(chart => {
        if (chart) chart.destroy();
    });
    charts = {};
}

async function renderRestaurantDashboard(contentArea) {
    destroyCharts(); // Clear previous charts
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Dashboard</h2>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="skeleton h-28"></div>
            <div class="skeleton h-28"></div>
            <div class="skeleton h-28"></div>
            <div class="skeleton h-28"></div>
            <div class="skeleton h-72 col-span-2 lg:col-span-4"></div>
            <div class="skeleton h-72 col-span-2 lg:col-span-4"></div>
        </div>`;

    const restaurantId = currentUser.restaurantId;
    const ordersSnapshot = await db.collection('orders')
                                   .where('restaurantId', '==', restaurantId)
                                   .where('status', 'in', ['delivered', 'completed'])
                                   .get();
    
    const orders = ordersSnapshot.docs.map(doc => doc.data());

    // --- Calculate KPIs ---
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysOrders = orders.filter(order => order.createdAt.toDate() >= today);
    const revenueToday = todaysOrders.reduce((sum, order) => sum + order.totalPrice, 0);

    // --- Process Data for Charts ---
    // Daily Sales (Last 7 Days)
    const salesData = { labels: [], datasets: [{ label: 'Daily Revenue', data: [], backgroundColor: 'rgba(212, 175, 55, 0.6)', borderColor: 'rgba(212, 175, 55, 1)', borderWidth: 1 }] };
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayString = date.toLocaleDateString('en-US', { weekday: 'short' });
        salesData.labels.push(dayString);

        const startOfDay = new Date(date);
        startOfDay.setHours(0,0,0,0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23,59,59,999);

        const dailyRevenue = orders
            .filter(o => o.createdAt.toDate() >= startOfDay && o.createdAt.toDate() <= endOfDay)
            .reduce((sum, o) => sum + o.totalPrice, 0);
        salesData.datasets[0].data.push(dailyRevenue);
    }
    
    // Top Selling Items
    const itemCounts = {};
    orders.forEach(order => {
        order.items.forEach(item => {
            itemCounts[item.name] = (itemCounts[item.name] || 0) + item.quantity;
        });
    });
    const sortedItems = Object.entries(itemCounts).sort(([,a],[,b]) => b-a).slice(0, 5);
    const topItemsData = {
        labels: sortedItems.map(item => item[0]),
        datasets: [{
            label: 'Quantity Sold',
            data: sortedItems.map(item => item[1]),
            backgroundColor: ['#D4AF37', '#1a202c', '#6c757d', '#f8f9fa', '#343a40'],
            hoverOffset: 4
        }]
    };
    
    // --- Render HTML ---
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Dashboard</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mb-6">
            <div class="bg-white p-4 rounded-xl shadow-md"><h4 class="text-sm font-semibold text-gray-500">Total Revenue</h4><p class="text-2xl font-bold mt-2">₹${totalRevenue.toFixed(2)}</p></div>
            <div class="bg-white p-4 rounded-xl shadow-md"><h4 class="text-sm font-semibold text-gray-500">Total Orders</h4><p class="text-2xl font-bold mt-2">${totalOrders}</p></div>
            <div class="bg-white p-4 rounded-xl shadow-md"><h4 class="text-sm font-semibold text-gray-500">Revenue Today</h4><p class="text-2xl font-bold mt-2">₹${revenueToday.toFixed(2)}</p></div>
            <div class="bg-white p-4 rounded-xl shadow-md"><h4 class="text-sm font-semibold text-gray-500">Avg. Order Value</h4><p class="text-2xl font-bold mt-2">₹${avgOrderValue.toFixed(2)}</p></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div class="lg:col-span-3 bg-white p-4 rounded-xl shadow-md">
                <h3 class="font-bold mb-4">Last 7 Days Revenue</h3>
                <canvas id="daily-sales-chart"></canvas>
            </div>
            <div class="lg:col-span-2 bg-white p-4 rounded-xl shadow-md">
                <h3 class="font-bold mb-4">Top Selling Items</h3>
                <canvas id="top-items-chart"></canvas>
            </div>
        </div>
        `;

    // --- Initialize Charts ---
    const salesCtx = document.getElementById('daily-sales-chart')?.getContext('2d');
    if (salesCtx) {
        charts.dailySales = new Chart(salesCtx, { type: 'bar', data: salesData, options: { responsive: true } });
    }

    const itemsCtx = document.getElementById('top-items-chart')?.getContext('2d');
    if (itemsCtx) {
        charts.topItems = new Chart(itemsCtx, { type: 'pie', data: topItemsData, options: { responsive: true } });
    }
}


async function renderRestaurantOrders(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Order Management</h2>
        <div class="bg-white p-4 rounded-xl shadow-md">
            <div class="border-b mb-4">
                <nav id="order-tabs" class="flex -mb-px space-x-6">
                    <button data-status="new" class="order-tab-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300">New Orders</button>
                    <button data-status="preparing" class="order-tab-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300">Preparing</button>
                    <button data-status="ready" class="order-tab-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300">Ready for Pickup</button>
                    <button data-status="history" class="order-tab-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700 hover:border-gray-300">Order History</button>
                </nav>
            </div>
             <div id="order-history-controls" class="hidden bg-gray-50 p-4 rounded-lg my-4 space-y-3 border">
                <h3 class="font-semibold text-lg font-serif">Download Order Report</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label for="report-type" class="block text-sm font-medium">Report Type</label>
                        <select id="report-type" class="input-field w-full mt-1">
                            <option value="daily">Daily</option>
                            <option value="monthly">Monthly</option>
                            <option value="yearly">Yearly</option>
                        </select>
                    </div>
                    <div id="report-date-container">
                        <label for="report-date" class="block text-sm font-medium">Select Date</label>
                        <input type="date" id="report-date" class="input-field w-full mt-1">
                    </div>
                    <button data-action="download-report" class="btn btn-primary w-full h-12">Download CSV</button>
                </div>
            </div>
            <div class="relative mb-4">
                <input type="search" id="order-search" class="input-field w-full p-3 pl-10" placeholder="Search by Order ID, Customer, or Item Name...">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i data-feather="search" class="text-gray-400"></i></div>
            </div>
            <div id="restaurant-orders-list" class="space-y-4"></div>
        </div>`;
    
    const tabs = contentArea.querySelectorAll('.order-tab-btn');
    const historyControls = document.getElementById('order-history-controls');
    
    tabs.forEach(tab => tab.addEventListener('click', () => {
        loadOrdersByStatus(tab.dataset.status);
        tabs.forEach(t => t.classList.remove('border-indigo-500', 'text-indigo-600'));
        tab.classList.add('border-indigo-500', 'text-indigo-600');
        historyControls.classList.toggle('hidden', tab.dataset.status !== 'history');
    }));
    
    contentArea.querySelector('#order-search').addEventListener('input', () => loadOrdersByStatus(contentArea.querySelector('.order-tab-btn.border-indigo-500').dataset.status));
    
    document.getElementById('report-type').addEventListener('change', (e) => {
        const dateContainer = document.getElementById('report-date-container');
        const type = e.target.value;
        if (type === 'daily') {
            dateContainer.innerHTML = `<label for="report-date" class="block text-sm font-medium">Select Date</label><input type="date" id="report-date" class="input-field w-full mt-1">`;
        } else if (type === 'monthly') {
            dateContainer.innerHTML = `<label for="report-month" class="block text-sm font-medium">Select Month</label><input type="month" id="report-month" class="input-field w-full mt-1">`;
        } else { // yearly
            dateContainer.innerHTML = `<label for="report-year" class="block text-sm font-medium">Enter Year</label><input type="number" id="report-year" class="input-field w-full mt-1" placeholder="YYYY" value="${new Date().getFullYear()}">`;
        }
    });

    loadOrdersByStatus('new');
    tabs[0].classList.add('border-indigo-500', 'text-indigo-600');
    feather.replace();
}

function loadOrdersByStatus(status) {
    destroyCharts();
    const restaurantId = currentUser.restaurantId;
    const listEl = document.getElementById('restaurant-orders-list');
    
    let query;
    if (status === 'new') query = db.collection('orders').where('restaurantId', '==', restaurantId).where('status', '==', 'placed');
    else if (status === 'preparing') query = db.collection('orders').where('restaurantId', '==', restaurantId).where('status', '==', 'accepted');
    else if (status === 'ready') query = db.collection('orders').where('restaurantId', '==', restaurantId).where('status', '==', 'ready-for-pickup');
    else query = db.collection('orders').where('restaurantId', '==', restaurantId).where('status', 'in', ['delivered', 'cancelled', 'completed']);

    const unsub = query.onSnapshot(async snapshot => {
        const searchTerm = document.getElementById('order-search').value.toLowerCase();
        let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (searchTerm) {
            orders = orders.filter(order => 
                order.id.toLowerCase().includes(searchTerm) || 
                order.customerName.toLowerCase().includes(searchTerm) ||
                order.items.some(item => item.name.toLowerCase().includes(searchTerm))
            );
        }

        if (orders.length === 0) {
            listEl.innerHTML = '<p class="text-center text-gray-500 py-8">No orders found.</p>'; return;
        }
        
        const ordersHtml = await Promise.all(orders.sort((a,b) => b.createdAt.seconds - a.createdAt.seconds).map(async order => {
            let callButtonHtml = '';
            if (order.customerId) {
                const customerDoc = await db.collection('users').doc(order.customerId).get();
                if (customerDoc.exists && customerDoc.data().mobile) {
                    callButtonHtml = `<a href="tel:${customerDoc.data().mobile}" title="Call ${order.customerName}" class="ml-2 p-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200"><i data-feather="phone-call" class="w-4 h-4"></i></a>`;
                } else {
                    callButtonHtml = `<span title="Phone not available" class="ml-2 p-1 bg-gray-100 text-gray-400 rounded-full cursor-not-allowed"><i data-feather="phone-off" class="w-4 h-4"></i></span>`;
                }
            }
            
            const itemsWithImages = await Promise.all(order.items.map(async (item) => {
                const itemDoc = await db.collection('restaurants').doc(order.restaurantId).collection('menu').doc(item.id.split('-')[0]).get();
                return { ...item, imageUrl: itemDoc.exists ? itemDoc.data().imageUrl : '' };
            }));

            let actionButtons = '';
            if (order.status === 'placed') {
                actionButtons = `<button data-action="accept-order" data-order-id="${order.id}" class="btn btn-primary flex-1">Accept</button><button data-action="deny-order" data-order-id="${order.id}" class="btn bg-gray-200 flex-1">Deny</button>`;
            } else if (order.deliveryType === 'takeaway') {
                if (order.status === 'accepted') {
                     actionButtons = `<button data-action="change-status" data-order-id="${order.id}" data-new-status="ready-for-pickup" class="btn btn-secondary flex-1">Mark as Ready for Pickup</button>`;
                } else if (order.status === 'ready-for-pickup') {
                    const isPaid = order.paymentStatus === 'paid';
                    actionButtons = `<button 
                        data-action="change-status" data-order-id="${order.id}" data-new-status="completed" 
                        class="btn ${isPaid ? 'btn-primary' : 'bg-gray-300 cursor-not-allowed'} flex-1" 
                        ${!isPaid ? 'disabled title="Payment must be marked as Paid first."' : ''}>
                        Mark as Completed
                    </button>`;
                }
            }

            let paymentInfoHtml = '';
            if (order.deliveryType === 'takeaway') {
                const isPaid = order.paymentStatus === 'paid';
                paymentInfoHtml = `
                    <div class="mt-3 border-t pt-3">
                        <div class="flex justify-between items-center">
                            <p class="font-semibold text-sm">Payment:</p>
                            <span class="font-bold text-sm px-2 py-1 rounded-full ${isPaid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}">${isPaid ? 'PAID' : 'PENDING'}</span>
                        </div>
                        ${!isPaid && ['accepted', 'ready-for-pickup'].includes(order.status) ? 
                            `<button data-action="mark-as-paid" data-order-id="${order.id}" class="btn btn-secondary w-full mt-2 text-sm py-2">Mark as Paid</button>` : ''
                        }
                    </div>`;
            }

            return `
                <div class="bg-gray-50 p-5 rounded-lg border">
                    <div class="flex flex-wrap justify-between items-start gap-2">
                        <div>
                            <p class="font-bold text-lg">Order #${order.id.substring(0,6)}</p>
                            <p class="text-sm text-gray-500 flex items-center">From: ${order.customerName}${callButtonHtml}</p>
                            <span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full ${order.deliveryType === 'takeaway' ? 'text-purple-600 bg-purple-200' : 'text-blue-600 bg-blue-200'}">${order.deliveryType || 'Delivery'}</span>
                        </div>
                        <p class="font-bold text-lg">₹${order.totalPrice.toFixed(2)}</p>
                    </div>
                    <div class="mt-4 border-t pt-4"><p class="font-semibold">Items:</p>
                        <div class="space-y-2 mt-2">${itemsWithImages.map(item => `<div class="flex items-center gap-3 text-sm"><img src="${item.imageUrl || 'https://placehold.co/48x48'}" class="w-10 h-10 rounded-md object-cover"><span>${item.quantity} x ${item.name}</span></div>`).join('')}</div>
                    </div>
                    ${paymentInfoHtml}
                    <div class="mt-4 flex gap-2">${actionButtons}<button data-action="view-bill" data-order-id="${order.id}" class="btn bg-white border flex-1 py-3">Bill</button></div>
                </div>`;
        }));
        listEl.innerHTML = ordersHtml.join('');
        feather.replace();
    });
    unsubscribeListeners.push(unsub);
}

async function changeOrderStatus(orderId, newStatus) {
    await db.collection('orders').doc(orderId).update({ status: newStatus });
    showToast(`Order status changed to ${newStatus}.`, 'success');
}

async function markPaymentAsPaid(orderId) {
    await db.collection('orders').doc(orderId).update({ paymentStatus: 'paid' });
    showToast('Payment status updated to Paid.', 'success');
}

async function acceptOrder(orderId) {
    await db.collection('orders').doc(orderId).update({ status: 'accepted' });
    showToast('Order Accepted! It is now in the "Preparing" tab.', 'success');
}

async function denyOrder(orderId) {
    showConfirmationModal('Deny Order?', 'Are you sure? The customer will be notified that it was cancelled.', async () => {
        await db.collection('orders').doc(orderId).update({ status: 'cancelled' });
        showToast('Order has been cancelled.', 'error');
    });
}

async function downloadOrderReport() {
    const typeSelect = document.getElementById('report-type');
    if (!typeSelect) {
        console.error("Report type selector not found!");
        return;
    }
    const type = typeSelect.value;
    let startDate, endDate;
    let fileName = `Order_Report`;

    try {
        if (type === 'daily') {
            const dateInput = document.getElementById('report-date');
            if (!dateInput || !dateInput.value) {
                showToast('Please select a date.', 'error');
                return;
            }
            const dateVal = dateInput.value;
            startDate = new Date(dateVal + 'T00:00:00');
            endDate = new Date(dateVal + 'T23:59:59');
            fileName += `_${dateVal}`;
        } else if (type === 'monthly') {
            const monthInput = document.getElementById('report-month');
            if (!monthInput || !monthInput.value) {
                showToast('Please select a month.', 'error');
                return;
            }
            const monthVal = monthInput.value;
            const [year, month] = monthVal.split('-').map(Number);
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0, 23, 59, 59, 999);
            fileName += `_${monthVal}`;
        } else { // yearly
            const yearInput = document.getElementById('report-year');
            if (!yearInput || !yearInput.value || yearInput.value.length !== 4) {
                showToast('Please enter a valid 4-digit year.', 'error');
                return;
            }
            const yearVal = yearInput.value;
            const year = Number(yearVal);
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31, 23, 59, 59, 999);
            fileName += `_${yearVal}`;
        }
    } catch (err) {
        console.error("Error parsing date:", err);
        showToast('Invalid date selected.', 'error');
        return;
    }

    showToast('Generating report, please wait...', 'info');

    try {
        const ordersSnapshot = await db.collection('orders')
            .where('restaurantId', '==', currentUser.restaurantId)
            .where('createdAt', '>=', startDate)
            .where('createdAt', '<=', endDate)
            .get();

        if (ordersSnapshot.empty) {
            showToast('No orders found for the selected period.', 'error');
            return;
        }

        let csvContent = "";
        const headers = ["OrderID", "CustomerName", "ItemName", "ItemVariant", "Quantity", "ItemPrice", "OrderTotal", "Date", "Time", "PaymentMethod", "PaymentStatus"];
        csvContent += headers.join(",") + "\r\n";

        ordersSnapshot.forEach(doc => {
            const order = { id: doc.id, ...doc.data() };
            const orderDate = order.createdAt.toDate();
            const formattedDate = orderDate.toISOString().split('T')[0];
            const formattedTime = orderDate.toLocaleTimeString('en-GB');
            
            order.items.forEach(item => {
                const row = [
                    order.id,
                    `"${order.customerName.replace(/"/g, '""')}"`,
                    `"${item.name.replace(/"/g, '""')}"`,
                    `"${(item.variantName || 'N/A').replace(/"/g, '""')}"`,
                    item.quantity,
                    item.price,
                    order.totalPrice,
                    formattedDate,
                    formattedTime,
                    order.paymentMethod || 'N/A',
                    order.deliveryType === 'takeaway' ? (order.paymentStatus || 'pending') : 'N/A'
                ].join(",");
                csvContent += row + "\r\n";
            });
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${fileName}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Report downloaded!', 'success');

    } catch (error) {
        console.error("Error generating report:", error);
        showToast("Failed to generate report. You may need to create a Firestore Index.", "error");
    }
}


async function renderRestaurantMenu(contentArea) {
    destroyCharts();
    contentArea.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold font-serif">Menu Management</h2>
            <button data-action="add-menu-item" class="btn btn-primary rounded-lg py-2 px-4 flex items-center gap-2"><i data-feather="plus"></i>Add Item</button>
        </div>
        <div id="restaurant-menu-list" class="space-y-4"></div>`;
    feather.replace();
    const listEl = document.getElementById('restaurant-menu-list');
    const unsub = db.collection('restaurants').doc(currentUser.restaurantId).collection('menu').onSnapshot(snapshot => {
         if (snapshot.empty) {
            listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">Your menu is empty.</p>'; return;
         }
         listEl.innerHTML = snapshot.docs.map(doc => renderMenuItemCard(doc)).join('');
         feather.replace();
    });
    unsubscribeListeners.push(unsub);
}

async function toggleItemAvailability(itemId, isAvailable) {
    const itemRef = db.collection('restaurants').doc(currentUser.restaurantId).collection('menu').doc(itemId);
    await itemRef.update({ isAvailable: isAvailable });
}

function renderMenuItemCard(doc) {
    const item = doc.data();
    const isAvailable = item.isAvailable !== false;
    const variants = item.variants && item.variants.length > 0 ? item.variants : [{ name: '', price: item.price }];
    
    return `
        <div class="bg-white p-4 border rounded-lg flex flex-col md:flex-row md:items-center gap-4">
            <img src="${item.imageUrl || 'https://placehold.co/100x100?text=Food'}" class="w-full md:w-24 h-40 md:h-24 object-cover rounded-md flex-shrink-0" onerror="this.src='https://placehold.co/100x100?text=Error'">
            
            <div class="flex-grow">
                <p class="font-semibold text-lg">${item.name}</p>
                <p class="text-sm text-gray-600 mt-1">${item.description || 'No description.'}</p>
                <div class="mt-2 text-sm">
                    ${variants.map(v => `<span class="inline-block bg-gray-100 rounded-full px-2 py-1 text-xs font-semibold mr-1 mb-1">${v.name ? `${v.name}: ` : ''}₹${v.price}</span>`).join('')}
                </div>
            </div>

            <div class="border-t md:border-t-0 md:border-l pt-4 md:pt-0 md:pl-4 flex flex-col justify-center items-stretch md:items-end gap-3 flex-shrink-0">
                <div class="flex items-center justify-between md:justify-end gap-2 w-full">
                    <span class="text-sm font-medium ${isAvailable ? 'text-green-600' : 'text-gray-500'}">${isAvailable ? 'Available' : 'Unavailable'}</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" onchange="toggleItemAvailability('${doc.id}', this.checked)" class="sr-only peer" ${isAvailable ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                </div>
                <div class="flex gap-2 w-full">
                    <button data-action="edit-menu-item" data-item-id="${doc.id}" class="btn bg-gray-200 p-2 flex-1 md:flex-none"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                    <button data-action="delete-menu-item" data-item-id="${doc.id}" class="btn bg-red-100 text-red-600 p-2 flex-1 md:flex-none"><i data-feather="trash" class="w-4 h-4"></i></button>
                </div>
            </div>
        </div>`;
}

async function showMenuItemForm(itemId = null) {
    const isEditing = itemId !== null;
    const restaurantId = currentUser.restaurantId;
    let item = { name: '', description: '', imageUrl: '', category: '', isVeg: false, variants: [{ name: '', price: '' }] };

    if (isEditing) {
        const itemDoc = await db.collection('restaurants').doc(restaurantId).collection('menu').doc(itemId).get();
        if (itemDoc.exists) {
            const data = itemDoc.data();
            item = { ...data, variants: data.variants && data.variants.length > 0 ? data.variants : [{ name: '', price: data.price || '' }] };
        }
    }

    const categoriesSnapshot = await db.collection('menuCategories').orderBy('name').get();
    const categoryOptions = categoriesSnapshot.docs.map(doc => {
        const categoryName = doc.data().name;
        const isSelected = item.category === categoryName ? 'selected' : '';
        return `<option value="${categoryName}" ${isSelected}>${categoryName}</option>`;
    }).join('');

    const formHtml = `
        <form id="menu-item-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif mb-4">${isEditing ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
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
            
            <div class="flex items-center">
                <input type="checkbox" id="is-veg-checkbox" name="isVeg" class="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500" ${item.isVeg ? 'checked' : ''}>
                <label for="is-veg-checkbox" class="ml-2 block text-sm text-gray-900">This item is Vegetarian</label>
            </div>

            <div>
                <label class="block text-sm font-medium mb-2">Item Image</label>
                <input type="file" id="menu-image-uploader" accept="image/*" class="hidden">
                <button type="button" class="btn bg-gray-100 text-gray-800 font-semibold py-3 px-4 rounded-lg flex items-center gap-2 w-full justify-center border-2 border-dashed hover:bg-gray-200" onclick="document.getElementById('menu-image-uploader').click();">
                    <i data-feather="upload-cloud" class="w-5 h-5"></i> 
                    <span>Upload from Device</span>
                </button>
                <div class="upload-loader text-sm text-center py-2" style="display:none;">
                    <div class="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
                    <span>Uploading...</span>
                </div>
                <div class="relative flex items-center my-2">
                    <div class="flex-grow border-t border-gray-300"></div><span class="flex-shrink mx-4 text-gray-400 text-xs">OR</span><div class="flex-grow border-t border-gray-300"></div>
                </div>
                <input type="url" name="imageUrl" class="input-field w-full" placeholder="Paste image URL here" value="${item.imageUrl || ''}">
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
    feather.replace();

    const form = document.getElementById('menu-item-form');
    const uploader = document.getElementById('menu-image-uploader');
    const urlInput = form.elements.imageUrl;
    const loader = form.querySelector('.upload-loader');
    
    uploader.addEventListener('change', (e) => handleImageUpload(e, urlInput, loader));

    const categorySelect = form.querySelector('select[name="category"]');
    const newCategoryContainer = document.getElementById('new-category-container');
    const newCategoryInput = form.querySelector('input[name="newCategoryName"]');

    categorySelect.addEventListener('change', (e) => {
        if (e.target.value === 'add_new') {
            newCategoryContainer.classList.remove('hidden');
            newCategoryInput.required = true;
        } else {
            newCategoryContainer.classList.add('hidden');
            newCategoryInput.required = false;
        }
    });

    urlInput.addEventListener('input', (e) => {
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

    form.addEventListener('submit', handleSaveMenuItem);
}

async function handleSaveMenuItem(e) {
    e.preventDefault();
    const form = e.target;
    const restaurantId = currentUser.restaurantId;
    const itemId = form.elements.itemId.value;

    const selectedCategoryValue = form.elements.category.value;
    let finalCategoryName = '';

    if (selectedCategoryValue === 'add_new') {
        const newCategoryName = form.elements.newCategoryName.value.trim();
        if (!newCategoryName) {
            showToast("New category name cannot be empty.", "error");
            return;
        }
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
        category: finalCategoryName,
        description: form.elements.description.value,
        imageUrl: form.elements.imageUrl.value,
        isVeg: form.elements.isVeg.checked,
        variants: variants,
        price: variants[0] ? variants[0].price : 0,
    };

    if (itemId) {
        await db.collection('restaurants').doc(restaurantId).collection('menu').doc(itemId).update(data);
        showToast("Menu item updated!");
    } else {
        data.isAvailable = true; // Default to available on creation
        await db.collection('restaurants').doc(restaurantId).collection('menu').add(data);
        showToast("New menu item added!");
    }
    closeModal();
}

function handleDeleteMenuItem(itemId) {
    showConfirmationModal("Delete Item?", "Are you sure? This cannot be undone.", async () => {
        await db.collection('restaurants').doc(currentUser.restaurantId).collection('menu').doc(itemId).delete();
    });
}

async function toggleRestaurantOpen(isOpen) {
    try {
        await db.collection('restaurants').doc(currentUser.restaurantId).update({ isOpen: isOpen });
        showToast(`Restaurant is now ${isOpen ? 'Open' : 'Closed'}.`, 'success');
    } catch (error) {
        console.error("Error updating restaurant status:", error);
        showToast("Failed to update status.", "error");
    }
}

async function renderRestaurantProfile(contentArea) {
     destroyCharts();
     const restDoc = await db.collection('restaurants').doc(currentUser.restaurantId).get();
     const restaurant = restDoc.data();
     contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Restaurant Profile</h2>
        <div class="bg-white p-6 rounded-xl shadow-md space-y-4">
            <form id="restaurant-profile-form" class="space-y-4">
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
                    <label class="block text-sm font-medium mb-2">Images</label>
                    <input type="file" id="profile-image-uploader" accept="image/*" class="hidden" multiple>
                    <button type="button" class="btn bg-gray-100 text-gray-800 font-semibold py-3 px-4 rounded-lg flex items-center gap-2 w-full justify-center border-2 border-dashed hover:bg-gray-200" onclick="document.getElementById('profile-image-uploader').click();">
                        <i data-feather="upload-cloud" class="w-5 h-5"></i> 
                        <span>Upload from Device</span>
                    </button>
                    <div class="upload-loader text-sm text-center py-2" style="display:none;">
                        <div class="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
                        <span>Uploading...</span>
                    </div>
                    <div class="relative flex items-center my-2">
                        <div class="flex-grow border-t border-gray-300"></div><span class="flex-shrink mx-4 text-gray-400 text-xs">OR</span><div class="flex-grow border-t border-gray-300"></div>
                    </div>
                    <textarea name="imageUrls" class="input-field w-full" rows="3" placeholder="Paste image URLs here (one per line)">${(restaurant.imageUrls || []).join('\n')}</textarea>
                    <div id="image-preview-container" class="mt-2 flex flex-wrap gap-2"></div>
                </div>
                
                <div class="flex flex-col sm:flex-row gap-4 pt-4 border-t">
                    <button type="button" class="btn bg-gray-200 text-lg py-3 px-6" onclick="renderRestaurantView('profile')">Cancel</button>
                    <button type="submit" class="btn btn-primary text-lg py-3 px-6">Save Changes</button>
                </div>
            </form>

            <div class="border-t pt-4 space-y-3">
                 <h3 class="text-xl font-bold font-serif mb-2">Settings</h3>
                 <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <label for="is-open" class="font-medium text-gray-700">Restaurant is Open</label>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="is-open" onchange="toggleRestaurantOpen(this.checked)" class="sr-only peer" ${restaurant.isOpen !== false ? 'checked' : ''}>
                      <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                </div>
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <label for="supports-delivery" class="font-medium text-gray-700">Enable Delivery Service</label>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="supports-delivery" name="supportsDelivery" class="sr-only peer" ${restaurant.supportsDelivery !== false ? 'checked' : ''}>
                      <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                </div>
                <button data-action="change-password" class="btn btn-secondary w-full sm:w-auto py-2 px-4 mt-2">Change Password</button>
            </div>
        </div>`;
    feather.replace();
        
    const form = document.getElementById('restaurant-profile-form');
    const uploader = document.getElementById('profile-image-uploader');
    const imageUrlsTextarea = form.elements.imageUrls;
    const loader = form.querySelector('.upload-loader');
    const previewContainer = document.getElementById('image-preview-container');

    uploader.addEventListener('change', (e) => handleImageUpload(e, imageUrlsTextarea, loader));

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
    updatePreview();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const updatedData = { 
            name: form.elements.name.value, 
            cuisine: form.elements.cuisine.value, 
            address: form.elements.address.value, 
            mobile: form.elements.mobile.value,
            imageUrls: form.elements.imageUrls.value.split('\n').filter(url => url.trim() !== ''), 
            supportsDelivery: document.getElementById('supports-delivery').checked 
        };
        await db.collection('restaurants').doc(currentUser.restaurantId).update(updatedData);
        showSimpleModal("Success", "Profile updated successfully!");
        renderRestaurantView('profile');
    });
}

async function renderMyReviews(contentArea) {
    destroyCharts();
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Customer Reviews</h2><div id="reviews-list">Loading...</div>`;
    const snapshot = await db.collection('reviews').where('restaurantId', '==', currentUser.restaurantId).get();
    if (snapshot.empty) { document.getElementById('reviews-list').innerHTML = '<p class="text-center bg-white p-6 rounded-lg">No reviews found.</p>'; return; }
    document.getElementById('reviews-list').innerHTML = snapshot.docs.map(doc => {
        const r = doc.data();
        return `<div class="bg-white p-4 rounded-lg shadow-sm mb-3"><div class="flex justify-between"><p class="font-semibold">${r.customerName}</p><div class="text-yellow-500">${'★'.repeat(r.restaurantRating)}${'☆'.repeat(5-r.restaurantRating)}</div></div><p class="text-gray-600 mt-2 italic">"${r.restaurantReview || 'No comment'}"</p></div>`;
    }).join('');
}

async function renderOrderBill(orderId) {
    showModal(`<p>Loading Bill...</p>`);
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) { showSimpleModal("Error", "Order not found."); return; }
    const order = orderDoc.data();
    const restaurantDoc = await db.collection('restaurants').doc(order.restaurantId).get();
    const restaurant = restaurantDoc.data();
    const customerDoc = await db.collection('users').doc(order.customerId).get();
    const customer = customerDoc.data();
    const billHtml = `
        <div id="printable-bill" class="bg-white p-6">
            <div class="text-center mb-8"><h2 class="text-3xl font-bold font-serif">${siteSettings.websiteName || 'UniFood'}</h2><p class="text-lg font-semibold">${order.restaurantName}</p><p class="text-sm text-gray-600">${restaurant.address}</p></div>
            <div class="flex justify-between items-center mb-6"><div><h3 class="text-2xl font-bold font-serif">Tax Invoice</h3><p class="text-sm text-gray-500">Invoice #: <strong>${orderId.substring(0, 8).toUpperCase()}</strong></p><p class="text-sm text-gray-500">Date: ${new Date(order.createdAt.seconds * 1000).toLocaleString()}</p></div><div id="qrcode-container" class="p-1 bg-white border rounded-lg"></div></div>
            <div class="border-y py-4 mb-6"><p class="font-bold">Billed To:</p><p>${order.customerName}</p><p>${order.deliveryAddress}</p><p>Email: ${customer.email}</p><p>Mobile: ${customer.mobile || 'N/A'}</p><p class="mt-2"><strong>Payment Method:</strong> <span class="capitalize">${order.paymentMethod || 'N/A'}</span></p><p><strong>Service Type:</strong> <span class="capitalize">${order.deliveryType || 'Delivery'}</span></p></div>
            <table class="w-full text-sm my-6"><thead class="border-b bg-gray-50"><tr><th class="text-left p-2">Item</th><th class="text-center p-2">Qty</th><th class="text-right p-2">Price</th><th class="text-right p-2">Total</th></tr></thead><tbody>${order.items.map(item => `<tr class="border-b"><td class="p-2">${item.name}</td><td class="text-center p-2">${item.quantity}</td><td class="text-right p-2">₹${item.price.toFixed(2)}</td><td class="text-right p-2">₹${(item.price * item.quantity).toFixed(2)}</td></tr>`).join('')}</tbody><tfoot class="font-semibold"><tr><td colspan="3" class="text-right p-2 border-t">Subtotal</td><td class="text-right p-2 border-t">₹${order.subtotal.toFixed(2)}</td></tr><tr><td colspan="3" class="text-right p-2">Delivery Fee</td><td class="text-right p-2">₹${(order.deliveryFee || 0).toFixed(2)}</td></tr><tr><td colspan="3" class="text-right p-2">Platform Fee</td><td class="text-right p-2">₹${(order.platformFee || 0).toFixed(2)}</td></tr><tr><td colspan="3" class="text-right p-2">GST (${order.gstRate || 5}%)</td><td class="text-right p-2">₹${order.gst.toFixed(2)}</td></tr><tr class="text-xl font-bold border-t-2 bg-gray-100"><td colspan="3" class="text-right p-2">Grand Total</td><td class="text-right p-2">₹${order.totalPrice.toFixed(2)}</td></tr></tfoot></table>
            <p class="text-center text-xs text-gray-500">Thank you for your order!</p>
        </div><div class="flex justify-end gap-2 mt-4"><button class="btn bg-gray-200" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="downloadBillAsPDF('${orderId}')">Download PDF</button></div>`;
    showModal(billHtml);
    new QRCode(document.getElementById("qrcode-container"), { text: orderId, width: 80, height: 80 });
}

function downloadBillAsPDF(orderId) {
    const element = document.getElementById('printable-bill');
    html2pdf().from(element).set({ filename: `Invoice_${orderId}.pdf` }).save();
}

function showModal(contentHtml) {
    modalContainer.innerHTML = `<div class="modal-content">${contentHtml}</div>`;
    modalContainer.classList.add('active');
    feather.replace();
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' };
    toast.className = `flex items-center gap-4 ${colors[type]} text-white py-3 px-5 rounded-lg shadow-xl toast-enter`;
    toast.innerHTML = `<i data-feather="${icons[type]}"></i><span class="font-semibold">${message}</span>`;
    container.appendChild(toast);
    feather.replace();
    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }, 4000);
}

function showSimpleModal(title, message, onOk) {
    showModal(`<div class="text-center"><h3 class="text-2xl font-bold font-serif mb-2">${title}</h3><p class="text-gray-600 mb-6">${message}</p><button id="simple-modal-ok" class="btn btn-primary rounded-lg py-2 px-12">OK</button></div>`);
    document.getElementById('simple-modal-ok').addEventListener('click', () => {
        if (onOk) onOk();
        closeModal();
    });
}

function showConfirmationModal(title, message, onConfirm, onCancel) {
    showModal(`<div class="text-center"><h3 class="text-2xl font-bold font-serif mb-2">${title}</h3><p class="text-gray-600 mb-6">${message}</p><div class="flex justify-center gap-4"><button id="confirm-cancel" class="btn bg-gray-200">Cancel</button><button id="confirm-ok" class="btn btn-danger">Confirm</button></div></div>`);
    document.getElementById('confirm-ok').addEventListener('click', () => { onConfirm(); closeModal(); });
    document.getElementById('confirm-cancel').addEventListener('click', () => { if(onCancel) onCancel(); closeModal(); });
}

function closeModal() {
    modalContainer.classList.remove('active');
    modalContainer.innerHTML = '';
}

function cleanupListeners() {
    destroyCharts();
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
}

// --- INITIALIZE APP ON LOAD ---
document.addEventListener('DOMContentLoaded', initializeApp);
const handleLogout = () => auth.signOut().then(() => { window.location.href = 'login.html'; });
logoutBtn.addEventListener('click', handleLogout);
mobileLogoutBtn.addEventListener('click', handleLogout);

// Mobile Menu Logic
function openMobileMenu() {
    mobileMenuOverlay.classList.remove('hidden'); document.body.style.overflow = 'hidden';
    setTimeout(() => { mobileMenuOverlay.classList.remove('opacity-0'); mobileMenu.classList.remove('translate-x-full'); }, 10);
}
function closeMobileMenu() {
    mobileMenuOverlay.classList.add('opacity-0'); mobileMenu.classList.add('translate-x-full'); document.body.style.overflow = '';
    setTimeout(() => { mobileMenuOverlay.classList.add('hidden'); }, 300);
}
mobileMenuButton.addEventListener('click', openMobileMenu);
closeMobileMenuButton.addEventListener('click', closeMobileMenu);
mobileMenuOverlay.addEventListener('click', (e) => { if (e.target === mobileMenuOverlay) closeMobileMenu(); });
