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
const websiteNameHeader = document.getElementById('website-name-header');
const websiteLogoHeader = document.getElementById('website-logo-header');
const announcementContainer = document.getElementById('announcement-banner-container');
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
const mobileMenu = document.getElementById('mobile-menu');
const closeMobileMenuButton = document.getElementById('close-mobile-menu');
const mobileUserInfo = document.getElementById('mobile-user-info');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

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
                    console.log("Restaurant Panel: Real-time settings received!"); // For debugging
                    if (doc.exists) {
                        siteSettings = doc.data();
                        applySiteSettings(); // This now works on the correct UI
                    }
                });
                unsubscribeListeners.push(settingsListener); // Add to cleanup queue

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
    // Safely access the nested theme object
    const theme = siteSettings.theme || {};
    const globalTheme = theme.global || {};

    if (siteSettings.websiteName) {
        websiteNameHeader.textContent = siteSettings.websiteName;
        document.title = `${siteSettings.websiteName} - Restaurant Panel`;
    }
    if (siteSettings.logoUrl) websiteLogoHeader.src = siteSettings.logoUrl;
    
    // Read colors from the correct nested globalTheme object
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
                if(e.target.closest('.sidebar-link')) {
                    closeMobileMenu();
                }
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
    renderRestaurantView('dashboard');
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

async function renderRestaurantDashboard(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Dashboard</h2><p>Loading stats...</p>`;
    const restaurantId = currentUser.restaurantId;
    const ordersSnapshot = await db.collection('orders').where('restaurantId', '==', restaurantId).get();
    const orders = ordersSnapshot.docs.map(doc => doc.data());

    const totalRevenue = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    const avgRating = restaurantDoc.exists ? restaurantDoc.data().avgRating || 0 : 0;

    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Dashboard</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div class="bg-white p-6 rounded-xl shadow-md text-center"><h4 class="text-lg font-semibold text-gray-500">Total Orders</h4><p class="text-4xl font-bold mt-2">${orders.length}</p></div>
            <div class="bg-white p-6 rounded-xl shadow-md text-center"><h4 class="text-lg font-semibold text-gray-500">Total Revenue</h4><p class="text-4xl font-bold mt-2">₹${totalRevenue.toFixed(2)}</p></div>
            <div class="bg-white p-6 rounded-xl shadow-md text-center"><h4 class="text-lg font-semibold text-gray-500">Average Rating</h4><p class="text-4xl font-bold mt-2 flex items-center justify-center gap-2"><i data-feather="star" class="w-8 h-8 fill-current text-yellow-500"></i>${avgRating.toFixed(1)}</p></div>
        </div>
        `;
    feather.replace();
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
            <div class="relative mb-4">
                <input type="search" id="order-search" class="input-field w-full p-3 pl-10" placeholder="Search by Order ID, Customer, or Item Name...">
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i data-feather="search" class="text-gray-400"></i></div>
            </div>
            <div id="restaurant-orders-list" class="space-y-4"></div>
        </div>`;
    
    const tabs = contentArea.querySelectorAll('.order-tab-btn');
    tabs.forEach(tab => tab.addEventListener('click', () => {
        loadOrdersByStatus(tab.dataset.status);
        tabs.forEach(t => t.classList.remove('border-indigo-500', 'text-indigo-600'));
        tab.classList.add('border-indigo-500', 'text-indigo-600');
    }));
    
    contentArea.querySelector('#order-search').addEventListener('input', (e) => loadOrdersByStatus(contentArea.querySelector('.order-tab-btn.border-indigo-500').dataset.status));
    
    loadOrdersByStatus('new');
    tabs[0].classList.add('border-indigo-500', 'text-indigo-600');
    feather.replace();
}

function loadOrdersByStatus(status) {
    const restaurantId = currentUser.restaurantId;
    const listEl = document.getElementById('restaurant-orders-list');
    
    let query;
    if (status === 'new') {
        query = db.collection('orders').where('restaurantId', '==', restaurantId).where('status', '==', 'placed');
    } else if (status === 'preparing') {
        query = db.collection('orders').where('restaurantId', '==', restaurantId).where('status', '==', 'accepted');
    } else if (status === 'ready') {
        query = db.collection('orders').where('restaurantId', '==', restaurantId).where('status', '==', 'ready-for-pickup');
    } else { // history
        query = db.collection('orders').where('restaurantId', '==', restaurantId).where('status', 'in', ['delivered', 'cancelled', 'completed']);
    }

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
            listEl.innerHTML = '<p class="text-center text-gray-500 py-8">No orders found.</p>';
            return;
        }
        
        const ordersHtml = await Promise.all(orders.sort((a,b) => b.createdAt.seconds - a.createdAt.seconds).map(async order => {
            // Fetch customer data to get phone number
            let callButtonHtml = '';
            if (order.customerId) {
                const customerDoc = await db.collection('users').doc(order.customerId).get();
                if (customerDoc.exists && customerDoc.data().mobile) {
                    const customerMobile = customerDoc.data().mobile;
                    callButtonHtml = `
                        <a href="tel:${customerMobile}" title="Call ${order.customerName}" class="ml-2 p-1 bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors">
                            <i data-feather="phone-call" class="w-4 h-4"></i>
                        </a>`;
                } else {
                     callButtonHtml = `
                        <span title="Customer phone number not available" class="ml-2 p-1 bg-gray-100 text-gray-400 rounded-full cursor-not-allowed">
                            <i data-feather="phone-off" class="w-4 h-4"></i>
                        </span>`;
                }
            }
            
            const itemsWithImages = await Promise.all(order.items.map(async (item) => {
                const itemDoc = await db.collection('restaurants').doc(order.restaurantId).collection('menu').doc(item.id.split('-')[0]).get();
                return { ...item, imageUrl: itemDoc.exists ? itemDoc.data().imageUrl : '' };
            }));

            let actionButtons = '';
            if (order.status === 'placed') {
                actionButtons = `
                    <button data-action="accept-order" data-order-id="${order.id}" class="btn btn-primary flex-1">Accept</button>
                    <button data-action="deny-order" data-order-id="${order.id}" class="btn bg-gray-200 flex-1">Deny</button>
                `;
            } else if (order.deliveryType === 'takeaway') {
                if (order.status === 'accepted') {
                    actionButtons = `<button data-action="change-status" data-order-id="${order.id}" data-new-status="ready-for-pickup" class="btn btn-secondary flex-1">Mark as Ready for Pickup</button>`;
                } else if (order.status === 'ready-for-pickup') {
                    actionButtons = `<button data-action="change-status" data-order-id="${order.id}" data-new-status="completed" class="btn btn-primary flex-1">Mark as Completed</button>`;
                }
            }

            return `
                <div class="bg-gray-50 p-5 rounded-lg border">
                    <div class="flex flex-wrap justify-between items-start gap-2">
                        <div>
                            <p class="font-bold text-lg">Order #${order.id.substring(0,6)}</p>
                            <p class="text-sm text-gray-500 flex items-center">
                                From: ${order.customerName}
                                ${callButtonHtml}
                            </p>
                            <span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full ${order.deliveryType === 'takeaway' ? 'text-purple-600 bg-purple-200' : 'text-blue-600 bg-blue-200'}">
                                ${order.deliveryType === 'takeaway' ? 'Takeaway' : 'Delivery'}
                            </span>
                        </div>
                        <p class="font-bold text-lg">₹${order.totalPrice.toFixed(2)}</p>
                    </div>
                    <div class="mt-4 border-t pt-4">
                        <p class="font-semibold">Items:</p>
                        <div class="space-y-2 mt-2">
                        ${itemsWithImages.map(item => `
                            <div class="flex items-center gap-3 text-sm">
                                <img src="${item.imageUrl || 'https://placehold.co/48x48'}" class="w-10 h-10 rounded-md object-cover">
                                <span>${item.quantity} x ${item.name}</span>
                            </div>`).join('')}
                        </div>
                    </div>
                    <div class="mt-4 flex gap-2">
                        ${actionButtons}
                        <button data-action="view-bill" data-order-id="${order.id}" class="btn bg-white border flex-1 py-3">Bill</button>
                    </div>
                </div>
            `;
        }));
        listEl.innerHTML = ordersHtml.join('');
        feather.replace();
    });
    unsubscribeListeners.push(unsub);
}

async function changeOrderStatus(orderId, newStatus) {
    await db.collection('orders').doc(orderId).update({ status: newStatus });
    showSimpleModal('Status Updated', `The order status has been changed to ${newStatus}.`);
}

async function acceptOrder(orderId) {
    await db.collection('orders').doc(orderId).update({ status: 'accepted' });
    showSimpleModal('Order Accepted', 'The order is now in the "Preparing" tab.');
}

async function denyOrder(orderId) {
    showConfirmationModal(
        'Deny Order?',
        'Are you sure you want to deny this order? The customer will be notified that it was cancelled. This cannot be undone.',
        async () => {
            await db.collection('orders').doc(orderId).update({ status: 'cancelled' });
            showSimpleModal('Order Denied', 'The order has been successfully cancelled.');
        }
    );
}


async function renderRestaurantMenu(contentArea) {
    contentArea.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-3xl font-bold font-serif">Menu Management</h2>
            <button data-action="add-menu-item" class="btn btn-primary rounded-lg py-2 px-4 flex items-center gap-2"><i data-feather="plus"></i>Add Item</button>
        </div>
        <div id="restaurant-menu-list" class="space-y-3"></div>`;
    feather.replace();
    const listEl = document.getElementById('restaurant-menu-list');
    const unsub = db.collection('restaurants').doc(currentUser.restaurantId).collection('menu').onSnapshot(snapshot => {
         if (snapshot.empty) {
            listEl.innerHTML = '<p class="text-center bg-white p-6 rounded-lg shadow-md">Your menu is empty.</p>';
            return;
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


// REPLACE the existing renderMenuItemCard function in restaurant_panel.js with this one:

function renderMenuItemCard(doc) {
    const item = doc.data();
    const isAvailable = item.isAvailable !== false;
    const variants = item.variants && item.variants.length > 0 ? item.variants : [{ name: '', price: item.price }];
    
    return `
        <div class="flex items-center justify-between p-4 border rounded-lg bg-white">
            <img src="${item.imageUrl || 'https://placehold.co/100x100?text=Food'}" class="w-20 h-20 object-cover rounded-md mr-4 flex-shrink-0">
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
            <div class="flex items-center flex-col sm:flex-row gap-4">
                <div class="flex items-center gap-2">
                    <span class="text-sm font-medium ${isAvailable ? 'text-green-600' : 'text-gray-500'}">${isAvailable ? 'Available' : 'Unavailable'}</span>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" onchange="toggleItemAvailability('${doc.id}', this.checked)" class="sr-only peer" ${isAvailable ? 'checked' : ''}>
                      <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                </div>
                <div class="flex gap-2">
                    <button data-action="edit-menu-item" data-item-id="${doc.id}" class="btn bg-gray-200 p-2"><i data-feather="edit-2" class="w-4 h-4"></i></button>
                    <button data-action="delete-menu-item" data-item-id="${doc.id}" class="btn bg-red-100 text-red-600 p-2"><i data-feather="trash" class="w-4 h-4"></i></button>
                </div>
            </div>
        </div>`;
}

async function showMenuItemForm(itemId = null) {
    const isEditing = itemId !== null;
    let item = { name: '', description: '', imageUrl: '', variants: [{ name: '', price: '' }] };
    if (isEditing) {
        const itemDoc = await db.collection('restaurants').doc(currentUser.restaurantId).collection('menu').doc(itemId).get();
        if (itemDoc.exists) {
            const data = itemDoc.data();
            item = { ...data, variants: data.variants && data.variants.length > 0 ? data.variants : [{ name: '', price: data.price || '' }] };
        }
    }

    const formHtml = `
        <form id="menu-item-form" class="space-y-4">
            <h3 class="text-2xl font-bold font-serif mb-4">${isEditing ? 'Edit Menu Item' : 'Add New Menu Item'}</h3>
            <input type="hidden" name="itemId" value="${itemId || ''}">
            <input type="text" name="name" class="input-field w-full" placeholder="Item Name (e.g., Biryani)" value="${item.name}" required>
            <textarea name="description" class="input-field w-full" rows="2" placeholder="Description">${item.description || ''}</textarea>
            <input type="url" name="imageUrl" class="input-field w-full" placeholder="Image URL" value="${item.imageUrl || ''}">
            
            <div class="border-t pt-4 mt-4">
                <h4 class="font-semibold mb-2">Pricing Variants</h4>
                <div id="variants-container" class="space-y-2">
                    ${item.variants.map((v, index) => `
                        <div class="variant-row flex items-center gap-2">
                            <input type="text" class="input-field flex-grow" placeholder="Variant Name (e.g., Half)" value="${v.name || ''}" required>
                            <input type="number" class="input-field w-28" placeholder="Price" value="${v.price || ''}" step="0.01" required>
                            <button type="button" class="btn btn-danger p-2 remove-variant-btn" ${index === 0 ? 'disabled' : ''}>&times;</button>
                        </div>
                    `).join('')}
                </div>
                <button type="button" id="add-variant-btn" class="btn btn-secondary text-sm mt-2 py-1 px-3">Add Variant</button>
            </div>

            <div class="flex justify-end gap-4 pt-4"><button type="button" class="btn bg-gray-200" onclick="closeModal()">Cancel</button><button type="submit" class="btn btn-primary">Save Item</button></div>
        </form>
    `;
    showModal(formHtml);

    const variantsContainer = document.getElementById('variants-container');
    const addVariantBtn = document.getElementById('add-variant-btn');

    const addVariantRow = () => {
        const row = document.createElement('div');
        row.className = 'variant-row flex items-center gap-2';
        row.innerHTML = `
            <input type="text" class="input-field flex-grow" placeholder="Variant Name (e.g., Full)" required>
            <input type="number" class="input-field w-28" placeholder="Price" step="0.01" required>
            <button type="button" class="btn btn-danger p-2 remove-variant-btn">&times;</button>
        `;
        variantsContainer.appendChild(row);
    };

    addVariantBtn.addEventListener('click', addVariantRow);
    variantsContainer.addEventListener('click', e => {
        if (e.target.classList.contains('remove-variant-btn')) {
            e.target.closest('.variant-row').remove();
        }
    });

    document.getElementById('menu-item-form').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        
        const variants = [];
        let validationPassed = true;
        form.querySelectorAll('.variant-row').forEach(row => {
            const nameInput = row.children[0];
            const priceInput = row.children[1];
            if(!nameInput.value.trim() || !priceInput.value){
                validationPassed = false;
            }
            variants.push({
                name: nameInput.value.trim(),
                price: parseFloat(priceInput.value)
            });
        });

        if(!validationPassed){
            showSimpleModal("Error", "Please fill out all variant name and price fields.");
            return;
        }

        const data = {
            name: form.elements.name.value,
            description: form.elements.description.value,
            imageUrl: form.elements.imageUrl.value,
            variants: variants,
            price: variants[0] ? variants[0].price : 0, 
        };

        const itmId = form.elements.itemId.value;
        const menuRef = db.collection('restaurants').doc(currentUser.restaurantId).collection('menu');

        if (itmId) {
            await menuRef.doc(itmId).update(data);
        } else {
            data.isAvailable = true;
            await menuRef.add(data);
        }
        closeModal();
    });
}


function handleDeleteMenuItem(itemId) {
    showConfirmationModal("Delete Item?", "Are you sure? This cannot be undone.", async () => {
        await db.collection('restaurants').doc(currentUser.restaurantId).collection('menu').doc(itemId).delete();
    });
}

async function renderRestaurantProfile(contentArea) {
     const restDoc = await db.collection('restaurants').doc(currentUser.restaurantId).get();
     const restaurant = restDoc.data();
     contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">Restaurant Profile</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <form id="restaurant-profile-form" class="space-y-4">
                <input type="text" name="name" class="input-field w-full" value="${restaurant.name}" required>
                <input type="text" name="cuisine" class="input-field w-full" value="${restaurant.cuisine}" required>
                <textarea name="address" class="input-field w-full" rows="3" required>${restaurant.address}</textarea>
                <textarea name="imageUrls" class="input-field w-full" rows="3" placeholder="Image URLs, one per line">${(restaurant.imageUrls || []).join('\n')}</textarea>
                
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <label for="supports-delivery" class="font-medium text-gray-700">Enable Delivery Service</label>
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" id="supports-delivery" name="supportsDelivery" class="sr-only peer" ${restaurant.supportsDelivery !== false ? 'checked' : ''}>
                      <div class="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
                    </label>
                </div>

                <div class="flex gap-4 pt-2"><button type="submit" class="btn btn-primary">Save Changes</button><button type="button" id="change-password-btn" class="btn btn-secondary">Change Password</button></div>
            </form>
        </div>`;
    document.getElementById('restaurant-profile-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const updatedData = {
            name: form.elements.name.value,
            cuisine: form.elements.cuisine.value,
            address: form.elements.address.value,
            imageUrls: form.elements.imageUrls.value.split('\n').filter(url => url.trim() !== ''),
            supportsDelivery: form.elements.supportsDelivery.checked,
        };
        await db.collection('restaurants').doc(currentUser.restaurantId).update(updatedData);
        showSimpleModal("Success", "Profile updated successfully!");
    });
    document.getElementById('change-password-btn').addEventListener('click', () => {
        showConfirmationModal('Change Password?', 'A password reset link will be sent to your email.', () => {
            auth.sendPasswordResetEmail(currentUser.email)
                .then(() => showSimpleModal('Email Sent', 'Password reset email sent.'))
                .catch(err => showSimpleModal('Error', err.message));
        });
    });
}

async function renderMyReviews(contentArea) {
    contentArea.innerHTML = `<h2 class="text-3xl font-bold font-serif mb-6">Customer Reviews</h2><div id="reviews-list">Loading...</div>`;
    const snapshot = await db.collection('reviews').where('restaurantId', '==', currentUser.restaurantId).get();
    if (snapshot.empty) {
        document.getElementById('reviews-list').innerHTML = '<p class="text-center bg-white p-6 rounded-lg">No reviews found.</p>';
        return;
    }
    document.getElementById('reviews-list').innerHTML = snapshot.docs.map(doc => {
        const r = doc.data();
        return `
            <div class="bg-white p-4 rounded-lg shadow-sm mb-3">
                <div class="flex justify-between"><p class="font-semibold">${r.customerName}</p><div class="text-yellow-500">${'★'.repeat(r.restaurantRating)}${'☆'.repeat(5-r.restaurantRating)}</div></div>
                <p class="text-gray-600 mt-2 italic">"${r.restaurantReview || 'No comment'}"</p>
            </div>`;
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

    const itemsWithImages = await Promise.all(order.items.map(async (item) => {
        const itemDoc = await db.collection('restaurants').doc(order.restaurantId).collection('menu').doc(item.id.split('-')[0]).get();
        return { ...item, imageUrl: itemDoc.exists ? itemDoc.data().imageUrl : '' };
    }));
    
    const billHtml = `
        <div id="printable-bill" class="bg-white p-6">
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
                <thead class="border-b bg-gray-50"><tr><th class="text-left p-2">Item</th><th class="text-center p-2">Qty</th><th class="text-right p-2">Price</th><th class="text-right p-2">Total</th></tr></thead>
                <tbody>
                    ${itemsWithImages.map(item => `
                        <tr class="border-b">
                            <td class="p-2 flex items-center gap-2"><img src="${item.imageUrl || 'https://placehold.co/48x48'}" class="w-10 h-10 rounded-md object-cover"><span>${item.name}</span></td>
                            <td class="text-center p-2">${item.quantity}</td>
                            <td class="text-right p-2">₹${item.price.toFixed(2)}</td>
                            <td class="text-right p-2">₹${(item.price * item.quantity).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
                <tfoot class="font-semibold">
                    <tr><td colspan="3" class="text-right p-2 border-t">Subtotal</td><td class="text-right p-2 border-t">₹${order.subtotal.toFixed(2)}</td></tr>
                    <tr><td colspan="3" class="text-right p-2">Delivery Fee</td><td class="text-right p-2">₹${(order.deliveryFee || 0).toFixed(2)}</td></tr>
                    <tr><td colspan="3" class="text-right p-2">Platform Fee</td><td class="text-right p-2">₹${(order.platformFee || 0).toFixed(2)}</td></tr>
                    <tr><td colspan="3" class="text-right p-2">GST (${order.gstRate || 5}%)</td><td class="text-right p-2">₹${order.gst.toFixed(2)}</td></tr>
                    <tr class="text-xl font-bold border-t-2 bg-gray-100"><td colspan="3" class="text-right p-2">Grand Total</td><td class="text-right p-2">₹${order.totalPrice.toFixed(2)}</td></tr>
                </tfoot>
            </table>
            <p class="text-center text-xs text-gray-500">Thank you for your order!</p>
        </div>
        <div class="flex justify-end gap-2 mt-4"><button class="btn bg-gray-200" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="downloadBillAsPDF('${orderId}')">Download PDF</button></div>`;
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

function showSimpleModal(title, message, onOk) {
    showModal(`
        <div class="text-center">
            <h3 class="text-2xl font-bold font-serif mb-2">${title}</h3>
            <p class="text-gray-600 mb-6">${message}</p>
            <button id="simple-modal-ok" class="btn btn-primary rounded-lg py-2 px-12">OK</button>
        </div>`);
    document.getElementById('simple-modal-ok').addEventListener('click', () => {
        if (onOk) onOk();
        closeModal();
    });
}

function showConfirmationModal(title, message, onConfirm, onCancel) {
    showModal(`
        <div class="text-center">
            <h3 class="text-2xl font-bold font-serif mb-2">${title}</h3>
            <p class="text-gray-600 mb-6">${message}</p>
            <div class="flex justify-center gap-4">
                <button id="confirm-cancel" class="btn bg-gray-200">Cancel</button>
                <button id="confirm-ok" class="btn btn-danger">Confirm</button>
            </div>
        </div>`);
    document.getElementById('confirm-ok').addEventListener('click', () => { onConfirm(); closeModal(); });
    document.getElementById('confirm-cancel').addEventListener('click', () => { if(onCancel) onCancel(); closeModal(); });
}

function closeModal() {
    modalContainer.classList.remove('active');
    modalContainer.innerHTML = '';
}

function cleanupListeners() {
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
}

// --- INITIALIZE APP ON LOAD ---
document.addEventListener('DOMContentLoaded', initializeApp);

const handleLogout = () => {
    auth.signOut().then(() => {
        window.location.href = 'login.html';
    });
};

logoutBtn.addEventListener('click', handleLogout);
mobileLogoutBtn.addEventListener('click', handleLogout);

// Mobile Menu Logic
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