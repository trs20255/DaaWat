
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
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const mainContent = document.getElementById('main-content');
const userInfo = document.getElementById('user-info');
const logoutBtn = document.getElementById('logout-btn');
const modalContainer = document.getElementById('modal-container');
const maintenanceOverlay = document.getElementById('maintenance-overlay');
const websiteNameHeader = document.getElementById('website-name-header');
const websiteLogoHeader = document.getElementById('website-logo-header');
const announcementContainer = document.getElementById('announcement-banner-container');

// Mobile Menu UI
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
const mobileMenu = document.getElementById('mobile-menu');
const closeMobileMenuButton = document.getElementById('close-mobile-menu');
const mobileUserInfo = document.getElementById('mobile-user-info');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

// --- CORE APP & AUTH LOGIC ---

async function initializeApp() {
    const settingsDoc = await db.collection('settings').doc('config').get();
    if (settingsDoc.exists) {
        siteSettings = settingsDoc.data();
    }
    applySiteSettings();

    auth.onAuthStateChanged(async (user) => {
        cleanupListeners();
        if (activePortalHandler) {
            mainContent.removeEventListener('click', activePortalHandler);
            activePortalHandler = null;
        }

        if (user) {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                currentUser = { uid: user.uid, ...userDoc.data() };
                if (siteSettings.maintenanceMode && currentUser.role !== 'superadmin') {
                    maintenanceOverlay.style.display = 'flex';
                    if(auth.currentUser) auth.signOut();
                    return;
                }

                if (currentUser.role !== 'delivery') {
                    showSimpleModal("Access Denied", "You do not have permission to access this panel.");
                    auth.signOut();
                    return;
                }

                if (currentUser.isLocked) {
                     showSimpleModal("Account Locked", "Your delivery account is currently locked. Please contact support.");
                     auth.signOut();
                     return;
                }
                
                const userHtml = `<p class="font-semibold">${currentUser.name}</p><p class="text-xs text-gray-500 capitalize">${currentUser.role}</p>`;
                userInfo.innerHTML = userHtml;
                mobileUserInfo.innerHTML = userHtml;
                
                showView('app');
                loadPortal(currentUser);
            } else {
                showSimpleModal("Error", "Your user data could not be found.");
                if(auth.currentUser) auth.signOut();
            }
        } else {
            currentUser = null;
            if (siteSettings.maintenanceMode) {
                maintenanceOverlay.style.display = 'flex';
            } else {
                showView('auth');
            }
        }
        feather.replace();
    });
}

function applySiteSettings() {
    if (siteSettings.websiteName) {
        websiteNameHeader.textContent = siteSettings.websiteName;
        document.title = `${siteSettings.websiteName} - Delivery`;
    }
    if (siteSettings.logoUrl) websiteLogoHeader.src = siteSettings.logoUrl;
    if (siteSettings.primaryColor) document.documentElement.style.setProperty('--primary-color', siteSettings.primaryColor);
    if (siteSettings.secondaryColor) document.documentElement.style.setProperty('--secondary-color', siteSettings.secondaryColor);
    if (siteSettings.heroBgImage) authContainer.style.backgroundImage = `url('${siteSettings.heroBgImage}')`;
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
    const template = document.getElementById('delivery-portal-template');
    if (template) {
        mainContent.appendChild(template.content.cloneNode(true));
        feather.replace();
        initializeDeliveryPortal();
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
        .catch(err => {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                errorEl.textContent = 'Invalid username or password. Please try again.';
            } else {
                errorEl.textContent = 'An error occurred. Please try again later.';
            }
        });
}

// --- DELIVERY PORTAL ---
function initializeDeliveryPortal() {
    activePortalHandler = handleDeliveryClicks;
    mainContent.addEventListener('click', activePortalHandler);
    modalContainer.addEventListener('click', handleDeliveryClicks); // Handle clicks inside modals
    document.getElementById('mobile-delivery-nav')?.addEventListener('click', activePortalHandler);
    renderDeliveryView('available-orders');
}

function handleDeliveryClicks(e) {
    const navLink = e.target.closest('[data-view]');
    if (navLink) {
        renderDeliveryView(navLink.dataset.view);
        return;
    }

    const actionButton = e.target.closest('[data-action]');
    if(actionButton) {
        const { action, orderId, newStatus } = actionButton.dataset;
        if(action === 'update-order-status') updateOrderStatus(orderId, newStatus);
        if(action === 'toggle-online-status') toggleOnlineStatus();
        if(action === 'accept-delivery') acceptDelivery(orderId);
        if(action === 'cancel-delivery') handleCancelDelivery(orderId);
        if(action === 'view-order-details') renderOrderDetailsModal(orderId);
        if(action === 'view-full-bill') renderOrderBill(orderId);
    }
}

function renderDeliveryView(viewName) {
    document.querySelectorAll('#delivery-nav .sidebar-link, #mobile-delivery-nav .mobile-nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === viewName);
    });

    const contentArea = document.getElementById('delivery-main-content');
    if (!contentArea) return;

    switch(viewName) {
        case 'available-orders': renderAvailableOrders(contentArea); break;
        case 'assigned-orders': renderDeliveryOrders(contentArea, false); break;
        case 'delivery-history': renderDeliveryOrders(contentArea, true); break;
        case 'earnings': renderDeliveryEarnings(contentArea); break;
        case 'reviews': renderMyReviews(contentArea); break;
        case 'profile': renderDeliveryProfile(contentArea); break;
    }
}

function renderAvailableOrders(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Available Orders</h2>
        <div id="available-orders-list" class="space-y-4"></div>
    `;
    const listEl = document.getElementById('available-orders-list');
    const unsub = db.collection('orders')
        .where('status', '==', 'accepted')
        .where('deliveryBoyId', '==', null)
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No available orders right now. Check back soon!</p>';
                return;
            }
            listEl.innerHTML = snapshot.docs.map(doc => {
                const order = doc.data();
                return `
                    <div class="bg-white p-5 rounded-xl shadow-md">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <p class="text-sm text-gray-500">From</p>
                                <p class="font-bold">${order.restaurantName}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-sm text-gray-500">Payout</p>
                                <p class="font-bold text-lg text-green-600">₹${(order.deliveryPayout || 30).toFixed(2)}</p>
                            </div>
                        </div>
                        <div class="mt-4 border-t pt-4">
                            <p class="text-sm font-semibold text-gray-700">DELIVER TO:</p>
                            <p class="text-base text-gray-800">${order.deliveryAddress}</p>
                        </div>
                        <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button data-action="view-order-details" data-order-id="${doc.id}" class="btn bg-gray-100 w-full">View Details</button>
                            <button data-action="accept-delivery" data-order-id="${doc.id}" class="btn btn-primary w-full">Accept Delivery</button>
                        </div>
                    </div>
                `;
            }).join('');
            feather.replace();
        });
    unsubscribeListeners.push(unsub);
}

async function acceptDelivery(orderId) {
    const orderRef = db.collection('orders').doc(orderId);
    try {
        await db.runTransaction(async (transaction) => {
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists) throw "Order does not exist!";
            if (orderDoc.data().deliveryBoyId !== null) throw "Order has already been taken.";
            transaction.update(orderRef, {
                deliveryBoyId: currentUser.uid,
                deliveryBoyName: currentUser.name
            });
        });
        closeModal();
        showSimpleModal("Success", "Order assigned to you!");
        renderDeliveryView('assigned-orders');
    } catch (e) {
        showSimpleModal("Error", "Could not accept order: " + e);
    }
}

function renderDeliveryOrders(contentArea, isHistory) {
    const title = isHistory ? 'Delivery History' : 'My Active Deliveries';
    const statuses = isHistory ? ['delivered', 'cancelled'] : ['accepted', 'picked-up', 'cancellation-requested'];

    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">${title}</h2>
        <div id="delivery-orders-list" class="space-y-4"></div>
    `;
    const listEl = document.getElementById('delivery-orders-list');
    const unsub = db.collection('orders')
        .where('deliveryBoyId', '==', currentUser.uid)
        .where('status', 'in', statuses)
        .onSnapshot(snapshot => {
            if(snapshot.empty) {
                listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No orders found.</p>';
                return;
            }
            const sortedDocs = snapshot.docs.sort((a, b) => b.data().createdAt.seconds - a.data().createdAt.seconds);
            listEl.innerHTML = sortedDocs.map(doc => renderDeliveryOrderCard(doc.id, doc.data(), isHistory)).join('');
            feather.replace();
        });
    unsubscribeListeners.push(unsub);
}

function renderDeliveryOrderCard(orderId, orderData, isHistory) {
    const statusColors = {
        'accepted': 'bg-blue-100 text-blue-800',
        'picked-up': 'bg-yellow-100 text-yellow-800',
        'delivered': 'bg-green-100 text-green-800',
        'cancelled': 'bg-red-100 text-red-800',
        'cancellation-requested': 'bg-orange-100 text-orange-800',
    };
    let actionButtons = '';
    if (!isHistory) {
         if(orderData.status === 'accepted') {
            actionButtons = `<button data-action="update-order-status" data-order-id="${orderId}" data-new-status="picked-up" class="btn btn-secondary w-full">Mark as Picked Up</button>`;
        } else if (orderData.status === 'picked-up') {
            actionButtons = `<button data-action="update-order-status" data-order-id="${orderId}" data-new-status="delivered" class="btn btn-primary w-full">Mark as Delivered</button>`;
        }
    }
   
    return `
        <div class="bg-white p-5 rounded-xl shadow-md">
            <div class="flex justify-between items-start">
                <div>
                    <p class="text-sm text-gray-500">Order #${orderId.substring(0,6)}</p>
                    <p class="font-bold text-lg">${orderData.restaurantName}</p>
                </div>
                <span class="font-semibold capitalize py-1 px-3 rounded-full text-xs ${statusColors[orderData.status] || 'bg-gray-100 text-gray-800'}">${orderData.status.replace('-', ' ')}</span>
            </div>
            <div class="mt-4 border-t pt-4">
                <p><strong>Customer:</strong> ${orderData.customerName}</p>
                <p><strong>Address:</strong> ${orderData.deliveryAddress}</p>
            </div>
            <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                ${actionButtons}
                <button data-action="view-order-details" data-order-id="${orderId}" class="btn bg-gray-100 w-full">View Details</button>
            </div>
            ${orderData.status !== 'cancellation-requested' && !isHistory ? `<button data-action="cancel-delivery" data-order-id="${orderId}" class="btn btn-danger w-full mt-2 text-sm py-1">Request Cancellation</button>` : ''}
        </div>
    `;
}

async function renderOrderDetailsModal(orderId) {
    showModal(`<div class="text-center"><p>Loading order details...</p></div>`);
    
    try {
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) throw new Error("Order not found.");
        const orderData = orderDoc.data();

        const restaurantDoc = await db.collection('restaurants').doc(orderData.restaurantId).get();
        const restaurantData = restaurantDoc.exists ? restaurantDoc.data() : {};

        const customerDoc = await db.collection('users').doc(orderData.customerId).get();
        const customerData = customerDoc.exists ? customerDoc.data() : {};
        
        const itemsWithImages = await Promise.all(orderData.items.map(async (item) => {
            const menuItemDoc = await db.collection('restaurants').doc(orderData.restaurantId).collection('menu').doc(item.id).get();
            const imageUrl = menuItemDoc.exists && menuItemDoc.data().imageUrl ? menuItemDoc.data().imageUrl : 'https://placehold.co/100x100?text=Food';
            return { ...item, imageUrl };
        }));

        let footerButtons = '';
        if (orderData.deliveryBoyId === null) { // Available order
            footerButtons = `
                <button class="btn bg-gray-200" onclick="closeModal()">Close</button>
                <button data-action="accept-delivery" data-order-id="${orderId}" class="btn btn-primary">Accept Delivery</button>
            `;
        } else { // Assigned or historical order
            footerButtons = `
                <button class="btn bg-gray-200" onclick="closeModal()">Close</button>
                <button data-action="view-full-bill" data-order-id="${orderId}" class="btn btn-primary">View Full Bill</button>
            `;
        }

        const modalHtml = `
            <h3 class="text-2xl font-bold font-serif mb-6 text-center">Order Details</h3>
            <div class="space-y-6">
                <!-- Restaurant Details -->
                <div class="bg-gray-50 p-4 rounded-lg">
                    <h4 class="font-bold text-lg mb-2 flex items-center gap-2"><i data-feather="map-pin"></i>Pickup From</h4>
                    <p class="font-semibold text-gray-800">${restaurantData.name || 'N/A'}</p>
                    <p class="text-gray-600">${restaurantData.address || 'N/A'}</p>
                    <div class="mt-2 flex gap-2">
                        <a href="tel:${restaurantData.mobile}" class="btn btn-secondary text-xs py-1 px-3">Call Restaurant</a>
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(restaurantData.address)}" target="_blank" class="btn bg-gray-200 text-xs py-1 px-3">View on Map</a>
                    </div>
                </div>

                <!-- Customer Details -->
                <div class="bg-blue-50 p-4 rounded-lg">
                    <h4 class="font-bold text-lg mb-2 flex items-center gap-2"><i data-feather="user"></i>Deliver To</h4>
                    <p class="font-semibold text-gray-800">${customerData.name || 'N/A'}</p>
                    <p class="text-gray-600">${orderData.deliveryAddress}</p>
                    <div class="mt-2 flex gap-2">
                        <a href="tel:${customerData.mobile}" class="btn btn-secondary text-xs py-1 px-3">Call Customer</a>
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(orderData.deliveryAddress)}" target="_blank" class="btn bg-gray-200 text-xs py-1 px-3">View on Map</a>
                    </div>
                </div>

                <!-- Order Items -->
                <div>
                    <h4 class="font-bold text-lg mb-2">Order Items</h4>
                    <div class="space-y-3 max-h-48 overflow-y-auto border rounded-lg p-2">
                        ${itemsWithImages.map(item => `
                            <div class="flex items-center gap-4">
                                <img src="${item.imageUrl}" class="w-12 h-12 object-cover rounded-md">
                                <div class="flex-grow">
                                    <p class="font-medium">${item.name}</p>
                                    <p class="text-sm text-gray-500">Qty: ${item.quantity}</p>
                                </div>
                                <p class="font-semibold">₹${(item.price * item.quantity).toFixed(2)}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Bill Summary -->
                <div class="border-t pt-4 space-y-1">
                    <div class="flex justify-between text-sm"><p>Subtotal</p><p>₹${orderData.subtotal.toFixed(2)}</p></div>
                    <div class="flex justify-between text-sm"><p>Delivery Fee</p><p>₹${orderData.deliveryFee.toFixed(2)}</p></div>
                    <div class="flex justify-between font-bold text-lg"><p>Grand Total</p><p>₹${orderData.totalPrice.toFixed(2)}</p></div>
                </div>
            </div>
             <div class="mt-6 flex justify-end gap-4">
                ${footerButtons}
            </div>
        `;
        showModal(modalHtml);
    } catch (error) {
        console.error("Error fetching order details:", error);
        showSimpleModal("Error", "Could not load order details. " + error.message);
    }
}


async function handleCancelDelivery(orderId) {
    const reason = prompt("Please provide a valid reason for requesting cancellation:");
    if (reason && reason.trim() !== "") {
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) {
            showSimpleModal("Error", "Order not found.");
            return;
        }
        const orderData = orderDoc.data();

        // Create a cancellation request
        await db.collection('cancellationRequests').add({
            orderId: orderId,
            deliveryBoyId: currentUser.uid,
            deliveryBoyName: currentUser.name,
            deliveryBoyPhone: currentUser.mobile || 'N/A',
            reason: reason,
            status: 'pending', // pending, approved, denied
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            previousStatus: orderData.status
        });

        // Update the order status to show a request is pending
        await orderRef.update({
            status: 'cancellation-requested'
        });

        showSimpleModal("Request Sent", "Your cancellation request has been sent to the admin for review.");
    } else {
        showSimpleModal("Reason Required", "A valid reason is required to request a cancellation.");
    }
}

async function updateOrderStatus(orderId, newStatus) {
    const orderRef = db.collection('orders').doc(orderId);
    await orderRef.update({ status: newStatus });
    if(newStatus === 'delivered') {
        const orderDoc = await orderRef.get();
        const deliveryPayout = orderDoc.data().deliveryPayout || 30;
        await db.collection('users').doc(currentUser.uid).update({
            earnings: firebase.firestore.FieldValue.increment(deliveryPayout)
        });
    }
}

async function renderDeliveryEarnings(contentArea) {
     contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Earnings</h2><p>Loading...</p>`;
     const userDoc = await db.collection('users').doc(currentUser.uid).get();
     const earnings = userDoc.data().earnings || 0;
     const completedOrdersSnapshot = await db.collection('orders').where('deliveryBoyId', '==', currentUser.uid).where('status', '==', 'delivered').get();
     contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Earnings</h2>
        <div class="bg-white p-6 rounded-xl shadow-md text-center mb-6">
            <h4 class="text-lg font-semibold text-gray-500">Total Earned</h4>
            <p class="text-5xl font-bold text-gray-800 mt-2">₹${earnings.toFixed(2)}</p>
        </div>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <h3 class="font-bold font-serif text-xl mb-4">Completed Deliveries (${completedOrdersSnapshot.size})</h3>
            <div class="space-y-2 max-h-96 overflow-y-auto">
                ${completedOrdersSnapshot.docs.map(doc => {
                    const order = doc.data();
                    return `<div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                <p>Order #${doc.id.substring(0,6)} from ${new Date(order.createdAt.seconds * 1000).toLocaleDateString()}</p>
                                <p class="font-semibold text-green-600">+ ₹${(order.deliveryPayout || 30).toFixed(2)}</p>
                            </div>`;
                }).join('') || '<p>No completed deliveries yet.</p>'}
            </div>
        </div>
     `;
}

function renderMyReviews(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">My Reviews</h2><div id="reviews-list">Loading...</div>`;
    const listEl = document.getElementById('reviews-list');
    db.collection('reviews').where('deliveryBoyId', '==', currentUser.uid).get().then(snapshot => {
        if (snapshot.empty) {
            listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No reviews found yet.</p>';
            return;
        }
        listEl.innerHTML = snapshot.docs.map(doc => {
            const review = doc.data();
            return `
                <div class="bg-white p-4 rounded-lg shadow-sm mb-3">
                    <div class="flex items-center justify-between">
                        <p class="font-semibold">${review.customerName}</p>
                        <div class="flex items-center text-yellow-500">${'★'.repeat(review.deliveryRating)}${'☆'.repeat(5-review.deliveryRating)}</div>
                    </div>
                    <p class="text-gray-600 mt-2 italic">"${review.deliveryReview || 'No comment'}"</p>
                    <p class="text-xs text-gray-400 mt-2 text-right">on ${new Date(review.createdAt.seconds * 1000).toLocaleDateString()}</p>
                </div>
            `;
        }).join('');
    });
}

function renderDeliveryProfile(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Profile</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <div id="delivery-profile-status" class="mb-6 pb-6 border-b"></div>
            
            <div class="space-y-4 mb-6 pb-6 border-b">
                 <button data-view="earnings" class="w-full text-left sidebar-link bg-gray-50 hover:bg-gray-100"><i data-feather="dollar-sign"></i>View My Earnings</button>
                 <button data-view="reviews" class="w-full text-left sidebar-link bg-gray-50 hover:bg-gray-100"><i data-feather="star"></i>View My Reviews</button>
            </div>

            <form id="delivery-profile-form" class="space-y-4">
                <div>
                    <label for="profile-name" class="block text-sm font-medium text-gray-700">Full Name</label>
                    <input type="text" id="profile-name" class="input-field mt-1 block w-full" value="${currentUser.name}" required>
                </div>
                <div>
                    <label for="profile-mobile" class="block text-sm font-medium text-gray-700">Mobile Number</label>
                    <input type="tel" id="profile-mobile" class="input-field mt-1 block w-full" value="${currentUser.mobile}" required>
                </div>
                <button type="submit" class="btn btn-primary py-3 px-6 rounded-lg">Update Profile</button>
            </form>
        </div>
    `;
    feather.replace();
    renderDeliveryProfileStatus(document.getElementById('delivery-profile-status'));
    document.getElementById('delivery-profile-form').addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('profile-name').value;
        const mobile = document.getElementById('profile-mobile').value;
        await db.collection('users').doc(currentUser.uid).update({ name, mobile });
        currentUser.name = name;
        currentUser.mobile = mobile;
        showSimpleModal('Success', 'Profile updated successfully!');
    });
}

function renderDeliveryProfileStatus(container) {
    const unsub = db.collection('users').doc(currentUser.uid).onSnapshot(doc => {
        const userData = doc.data();
        currentUser.isOnline = userData.isOnline;
        const isOnline = userData.isOnline || false;
        container.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <p class="font-semibold text-lg ${isOnline ? 'text-green-600' : 'text-red-600'}">You are ${isOnline ? 'Online' : 'Offline'}</p>
                    <p class="text-sm text-gray-500">${isOnline ? 'You can receive new delivery requests.' : 'Go online to start receiving orders.'}</p>
                </div>
                <button data-action="toggle-online-status" class="btn ${isOnline ? 'btn-danger' : 'btn-primary'} py-2 px-5 rounded-lg">Go ${isOnline ? 'Offline' : 'Online'}</button>
            </div>
        `;
    });
    unsubscribeListeners.push(unsub);
}

async function toggleOnlineStatus() {
    await db.collection('users').doc(currentUser.uid).update({ isOnline: !currentUser.isOnline });
}

// --- UTILITY & BILLING FUNCTIONS ---

async function renderOrderBill(orderId) {
    showModal(`<div class="text-center"><p>Loading Bill...</p></div>`);
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
        showSimpleModal("Error", "Order not found.");
        return;
    }
    const order = orderDoc.data();
    const restaurantDoc = await db.collection('restaurants').doc(order.restaurantId).get();
    const restaurant = restaurantDoc.data() || {};
    const customerDoc = await db.collection('users').doc(order.customerId).get();
    const customer = customerDoc.data() || {};

    const billHtml = `
        <div id="printable-bill" class="bg-white">
            <div class="p-6">
                <div class="text-center mb-8">
                    <h2 class="text-3xl font-bold font-serif">${siteSettings.websiteName || 'UniFood'}</h2>
                    <p class="text-lg font-semibold">${order.restaurantName}</p>
                    <p class="text-sm text-gray-600">${restaurant.address || ''}</p>
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
                    <p>Email: ${customer.email || 'N/A'}</p>
                    <p>Mobile: ${customer.mobile || 'N/A'}</p>
                </div>
                <table class="w-full text-sm my-6">
                    <thead class="border-b bg-gray-50"><tr><th class="text-left p-2">Item</th><th class="text-center p-2">Qty</th><th class="text-right p-2">Price</th><th class="text-right p-2">Total</th></tr></thead>
                    <tbody>
                        ${order.items.map(item => `
                            <tr class="border-b"><td class="p-2">${item.name}</td><td class="text-center p-2">${item.quantity}</td><td class="text-right p-2">₹${item.price.toFixed(2)}</td><td class="text-right p-2">₹${(item.price * item.quantity).toFixed(2)}</td></tr>
                        `).join('')}
                    </tbody>
                    <tfoot class="font-semibold">
                        <tr><td colspan="3" class="text-right p-2 border-t">Subtotal</td><td class="text-right p-2 border-t">₹${order.subtotal.toFixed(2)}</td></tr>
                        <tr><td colspan="3" class="text-right p-2">Delivery Fee</td><td class="text-right p-2">₹${(order.deliveryFee || 0).toFixed(2)}</td></tr>
                        <tr><td colspan="3" class="text-right p-2">Platform Fee</td><td class="text-right p-2">₹${(order.platformFee || 0).toFixed(2)}</td></tr>
                        <tr><td colspan="3" class="text-right p-2">GST (${order.gstRate || siteSettings.gstRate}%)</td><td class="text-right p-2">₹${order.gst.toFixed(2)}</td></tr>
                        <tr class="text-xl font-bold border-t-2 bg-gray-100"><td colspan="3" class="text-right p-2">Grand Total</td><td class="text-right p-2">₹${order.totalPrice.toFixed(2)}</td></tr>
                    </tfoot>
                </table>
                <p class="text-center text-xs text-gray-500">Thank you for your order!</p>
            </div>
        </div>
        <div class="flex justify-end gap-4 mt-4">
            <button class="btn bg-gray-200" onclick="closeModal()">Close</button>
            <button class="btn btn-primary" onclick="downloadBillAsPDF('${orderId}')">Download PDF</button>
        </div>
    `;
    showModal(billHtml);
    new QRCode(document.getElementById("qrcode-container"), { text: orderId, width: 80, height: 80 });
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

function showModal(contentHtml) {
    modalContainer.innerHTML = `<div class="modal-content">${contentHtml}</div>`;
    modalContainer.classList.add('active');
    feather.replace();
}

function showSimpleModal(title, message) {
    showModal(`
        <div class="text-center">
            <h3 class="text-2xl font-bold font-serif mb-2">${title}</h3>
            <p class="text-gray-600 mb-6">${message}</p>
            <button class="btn btn-primary rounded-lg py-2 px-12" onclick="closeModal()">OK</button>
        </div>
    `);
}

function closeModal() {
    modalContainer.classList.remove('active');
    modalContainer.innerHTML = '';
}

function cleanupListeners() {
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
}

// --- MOBILE MENU LOGIC ---
function openMobileMenu() {
    mobileMenuOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
        mobileMenuOverlay.classList.remove('opacity-0');
        mobileMenu.classList.remove('translate-x-full');
    }, 10);
}

function closeMobileMenu() {
    mobileMenuOverlay.classList.add('opacity-0');
    mobileMenu.classList.add('translate-x-full');
    document.body.style.overflow = '';
    setTimeout(() => {
        mobileMenuOverlay.classList.add('hidden');
    }, 300);
}

mobileMenuButton.addEventListener('click', openMobileMenu);
closeMobileMenuButton.addEventListener('click', closeMobileMenu);
mobileMenuOverlay.addEventListener('click', (e) => {
    if (e.target === mobileMenuOverlay) closeMobileMenu();
});

// --- INITIALIZE APP ON LOAD ---
document.addEventListener('DOMContentLoaded', initializeApp);

const handleLogout = () => {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    }).catch((error) => {
        console.error('Sign out error:', error);
        alert('An error occurred while logging out.');
    });
};

logoutBtn.addEventListener('click', handleLogout);
mobileLogoutBtn.addEventListener('click', handleLogout);
