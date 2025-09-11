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
let cart = [];
let html5QrCode = null;
let allRestaurantsCache = [];
let allMenuItemsCache = [];
let adSliderInterval = null;
let cartButtonTimeout = null;
const customerNotificationSound = new Audio('https://cdn.jsdelivr.net/npm/ion-sound@3.0.7/sounds/bell_ring.mp3');


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
const cartButton = document.getElementById('cart-button');
const cartCountEl = document.getElementById('cart-count');
const globalSearchContainer = document.getElementById('global-search-container');
const mobileSearchContainer = document.getElementById('mobile-search-container');
const mobileSearchButton = document.getElementById('mobile-search-button');

// Mobile Menu UI
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
const mobileMenu = document.getElementById('mobile-menu');
const closeMobileMenuButton = document.getElementById('close-mobile-menu');
const mobileUserInfo = document.getElementById('mobile-user-info');
const mobileLogoutBtn = document.getElementById('mobile-logout-btn');

// --- CORE APP & AUTH LOGIC ---
async function initializeApp() {
    const savedCart = localStorage.getItem('unifoodCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
    }

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
                
                const userHtml = `<p class="font-semibold">${currentUser.name}</p><p class="text-xs text-gray-500 capitalize">${currentUser.role}</p>`;
                userInfo.innerHTML = userHtml;
                mobileUserInfo.innerHTML = userHtml;
                
                showView('app');
                loadPortal(currentUser);
                listenForOrderStatusUpdates(); 

                const settingsListener = db.collection('settings').doc('config').onSnapshot(doc => {
                    if (doc.exists) {
                        siteSettings = doc.data();
                        applySiteSettings();
                    }
                });
                unsubscribeListeners.push(settingsListener);

            } else {
                showSimpleModal("Error", "Your user data could not be found. You have been logged out.");
                if(auth.currentUser) auth.signOut();
            }
        } else {
            currentUser = null;
            if (siteSettings.maintenanceMode) {
                maintenanceOverlay.style.display = 'flex';
                feather.replace();
            } else {
                showView('auth');
            }
        }
        updateCartButton();
    });
}

function listenForOrderStatusUpdates() {
    if (!currentUser) return;

    const query = db.collection('orders').where('customerId', '==', currentUser.uid);

    const unsub = query.onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'modified') {
                const orderData = change.doc.data();
                if (orderData.status === 'ready-for-pickup' && orderData.deliveryType === 'takeaway') {
                    customerNotificationSound.play().catch(e => console.error("Customer notification sound failed:", e));
                    showToast(`Your order from ${orderData.restaurantName} is ready for pickup!`, 'info');
                }
            }
        });
    }, error => {
        console.error("Order listener failed:", error);
    });
    unsubscribeListeners.push(unsub);
}


function logAudit(action, details) {
    if (!currentUser) return;
    db.collection('auditLog').add({
        action: action, details: details, performedBy: currentUser.name,
        role: currentUser.role, userId: currentUser.uid,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(error => console.error("Failed to write audit log:", error));
}

function applySiteSettings() {
    const theme = siteSettings.theme || {};
    const globalTheme = theme.global || {};

    if (siteSettings.websiteName) {
        websiteNameHeader.textContent = siteSettings.websiteName;
        document.title = siteSettings.websiteName;
    }
    if (siteSettings.logoUrl) websiteLogoHeader.src = siteSettings.logoUrl;
    
    document.documentElement.style.setProperty('--primary-color', globalTheme.primaryColor || '#1a202c');
    document.documentElement.style.setProperty('--secondary-color', globalTheme.secondaryColor || '#D4AF37');
    document.documentElement.style.setProperty('--background-color', globalTheme.backgroundColor || '#F8F9FA');
    document.documentElement.style.setProperty('--text-color', globalTheme.textColor || '#1f2937');
    document.documentElement.style.setProperty('--button-text-color', globalTheme.buttonTextColor || '#ffffff');
    
    if (globalTheme.useGradient) {
        const gradient = `linear-gradient(to right, ${globalTheme.gradientStart || '#4c51bf'}, ${globalTheme.gradientEnd || '#6b46c1'})`;
        document.documentElement.style.setProperty('--header-bg', gradient);
        websiteNameHeader.classList.add('text-white');
    } else {
        document.documentElement.style.setProperty('--header-bg', '#ffffff');
        websiteNameHeader.classList.remove('text-white');
    }

    if (siteSettings.heroBgImage) authContainer.style.backgroundImage = `url('${siteSettings.heroBgImage}')`;
    
    announcementContainer.innerHTML = ''; 
    db.collection('announcements').where('isActive', '==', true).limit(1).get().then(snapshot => {
        if (!snapshot.empty) {
            const announcement = snapshot.docs[0].data();
            announcementContainer.innerHTML = `<div class="bg-yellow-200 text-yellow-800 p-3 text-center text-sm"><strong>${announcement.title || 'Announcement'}:</strong> ${announcement.text}</div>`;
        }
    });
}


function showView(view) {
    const header = document.querySelector('header');
    cartButton.classList.add('hidden');
    mobileSearchContainer.classList.add('hidden');


    if (view === 'app') {
        authContainer.style.display = 'none';
        appContainer.style.display = 'block';
        header.style.display = 'flex';
        appContainer.classList.add('fade-in');
    } else { 
        appContainer.style.display = 'block';
        header.style.display = 'none';
        authContainer.style.display = 'flex';
        renderAuthForm('login');
    }
}

function loadPortal(user) {
    mainContent.innerHTML = '';
    cleanupListeners();
    if (activePortalHandler) {
        mainContent.removeEventListener('click', activePortalHandler);
        activePortalHandler = null;
    }
    const template = document.getElementById(`${user.role}-portal-template`);
    if (template) {
        mainContent.appendChild(template.content.cloneNode(true));
        feather.replace();
        if (user.role === 'customer') initializeCustomerPortal();
    } else {
        mainContent.innerHTML = `<p class="text-center text-red-500">Error: Portal template for role "${user.role}" not found.</p>`;
    }
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
    } else {
        document.getElementById('signup-form').addEventListener('submit', handleSignup);
        document.getElementById('show-login-link').addEventListener('click', (e) => { e.preventDefault(); renderAuthForm('login'); });
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

function handleSignup(e) {
    e.preventDefault();
    const errorEl = document.getElementById('signup-error');
    errorEl.textContent = '';
    const userData = {
        name: document.getElementById('signup-name').value,
        mobile: document.getElementById('signup-mobile').value,
        email: document.getElementById('signup-email').value,
        role: 'customer',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const password = document.getElementById('signup-password').value;
    auth.createUserWithEmailAndPassword(userData.email, password)
        .then(cred => db.collection('users').doc(cred.user.uid).set(userData))
        .catch(err => { errorEl.textContent = err.message; });
}

// --- CUSTOMER PORTAL ---
function initializeCustomerPortal() {
    activePortalHandler = handleCustomerClicks;
    mainContent.addEventListener('click', activePortalHandler);
    
    const desktopSearch = document.getElementById('global-search-bar');
    const mobileSearch = document.getElementById('mobile-global-search-bar');
    desktopSearch.addEventListener('input', handleGlobalSearch);
    mobileSearch.addEventListener('input', (e) => {
        desktopSearch.value = e.target.value;
        handleGlobalSearch(e);
    });
    
    mobileSearchButton.addEventListener('click', () => {
        mobileSearchContainer.classList.toggle('hidden');
        feather.replace();
    });

    const desktopNav = document.getElementById('customer-nav');
    const mobileNavContainer = document.getElementById('mobile-nav-links');
    if (desktopNav && mobileNavContainer) {
        mobileNavContainer.innerHTML = desktopNav.innerHTML;
        mobileNavContainer.addEventListener('click', handleCustomerClicks);
    }
    
    modalContainer.addEventListener('click', (e) => {
        const actionButton = e.target.closest('[data-action]');
        if (actionButton) {
            const { action, itemId, itemName, itemPrice, restaurantId, restaurantName } = actionButton.dataset;
            switch(action) {
                case 'remove-from-cart':
                    removeFromCart(itemId);
                    break;
                case 'add-to-cart':
                    addToCart(itemId, itemName, parseFloat(itemPrice), restaurantId, restaurantName, actionButton);
                    break;
            }
        }
    });

    cartButton.addEventListener('click', renderCartView);
    renderCustomerView('home');

    const setupClearButton = (inputEl) => {
        const parent = inputEl.parentNode;
        const clearBtn = document.createElement('button');
        clearBtn.innerHTML = '<i data-feather="x" class="w-5 h-5 text-gray-500"></i>';
        clearBtn.className = 'absolute inset-y-0 right-0 pr-4 flex items-center hidden';
        parent.appendChild(clearBtn);
        feather.replace();

        inputEl.addEventListener('input', () => {
            clearBtn.classList.toggle('hidden', inputEl.value === '');
        });

        clearBtn.addEventListener('click', () => {
            inputEl.value = '';
            inputEl.dispatchEvent(new Event('input'));
            clearBtn.classList.add('hidden');
        });
    };
    
    setupClearButton(desktopSearch);
    setupClearButton(mobileSearch);
}

function handleCustomerClicks(e) {
    const navLink = e.target.closest('[data-view]');
    if (navLink) {
        renderCustomerView(navLink.dataset.view);
        if (!mobileMenuOverlay.classList.contains('hidden')) {
            closeMobileMenu();
        }
        return;
    }

    const advertisementCard = e.target.closest('.advertisement-card');
    if (advertisementCard) {
        renderCustomerRestaurantView(advertisementCard.dataset.id);
        return;
    }

    const restaurantCard = e.target.closest('.restaurant-card, .featured-restaurant-card');
    if (restaurantCard) {
        renderCustomerRestaurantView(restaurantCard.dataset.id);
        return;
    }
    
    const cuisineCard = e.target.closest('[data-cuisine-filter]');
    if (cuisineCard) {
        const cuisine = cuisineCard.dataset.cuisineFilter;
        const searchInput = document.getElementById('global-search-bar');
        searchInput.value = cuisine;
        searchInput.dispatchEvent(new Event('input'));
        return;
    }

    const actionButton = e.target.closest('[data-action]');
    if(actionButton) {
        const { action, restaurantId, restaurantName, itemId, itemName, itemPrice, orderId } = actionButton.dataset;
        switch(action) {
            case 'back-to-home': renderCustomerView('home'); break;
            case 'add-to-cart': addToCart(itemId, itemName, parseFloat(itemPrice), restaurantId, restaurantName, actionButton); break;
            case 'view-bill': renderOrderBill(orderId); break;
            case 'rate-order': showRatingForm(orderId); break;
            case 'view-item-details': renderMenuItemDetailView(itemId, restaurantId); break;
            case 'cancel-order': handleCancelOrder(orderId); break;
            case 'reorder': handleReorder(orderId); break;
        }
    }
}

function renderCustomerView(viewName) {
    document.querySelectorAll('#customer-nav .sidebar-link, #mobile-nav-links .sidebar-link').forEach(link => {
        link.classList.toggle('active', link.dataset.view === viewName);
    });

    const contentArea = document.getElementById('customer-main-content');
    cartButton.classList.add('hidden');
    cleanupListeners(); 

    switch(viewName) {
        case 'home': renderCustomerHomepage(contentArea); break;
        case 'orders': renderCustomerOrdersView(contentArea); break;
        case 'profile': renderCustomerProfile(contentArea); break;
    }
}

async function renderCustomerHomepage(contentArea) {
    cartButton.classList.remove('hidden');

    const cuisines = [
        { name: 'Pizza', icon: 'disc' }, { name: 'Burger', icon: 'minus-circle' },
        { name: 'Indian', icon: 'sunrise' }, { name: 'Chinese', icon: 'wind' },
        { name: 'Italian', icon: 'flag' }, { name: 'Mexican', icon: 'hash' }
    ];

    const cuisineHtml = cuisines.map(c => `
        <div data-cuisine-filter="${c.name}" class="text-center p-4 bg-white rounded-xl shadow-md hover:shadow-lg transform hover:-translate-y-1 transition-all cursor-pointer">
            <i data-feather="${c.icon}" class="w-8 h-8 mx-auto text-gray-600"></i>
            <p class="mt-2 font-semibold text-sm">${c.name}</p>
        </div>
    `).join('');

    const skeletonCardHtml = `
        <div class="restaurant-card bg-white overflow-hidden">
            <div class="skeleton skeleton-img"></div>
            <div class="p-5">
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-text"></div>
            </div>
        </div>
    `;
    const skeletonList = Array(3).fill(skeletonCardHtml).join('');

    contentArea.innerHTML = `
        <div id="homepage-content" class="space-y-12">
            <div>
                <h3 class="text-2xl font-bold font-serif mb-4">Categories</h3>
                <div class="grid grid-cols-3 md:grid-cols-6 gap-4">${cuisineHtml}</div>
            </div>
            
            <div id="advertisement-container" class="my-8"></div>

            <div id="featured-restaurants-container">
                <h3 class="text-2xl font-bold font-serif mb-4">Top Rated Restaurants</h3>
                <div id="featured-restaurants-list" class="flex overflow-x-auto gap-6 pb-4"></div>
            </div>

            <div>
                <h3 class="text-2xl font-bold font-serif mb-4">All Restaurants</h3>
                <div id="all-restaurants-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    ${skeletonList}
                </div>
            </div>
        </div>
        <div id="search-results-container" class="hidden"></div>`;
    feather.replace();

    const adContainer = document.getElementById('advertisement-container');
    clearInterval(adSliderInterval);

    db.collection('advertisements').where('isEnabled', '==', true).get().then(snapshot => {
        if (!snapshot.empty) {
            const adsHtml = snapshot.docs.map(doc => `<div data-id="${doc.data().restaurantId}" class="advertisement-card"><img src="${doc.data().imageUrl}" alt="Advertisement"></div>`).join('');
            adContainer.innerHTML = `
                <h3 class="text-2xl font-bold font-serif mb-4">Special Offers</h3>
                <div class="advertisement-carousel-wrapper">${adsHtml}</div>
                <div class="carousel-dots"></div>`;
            if (snapshot.docs.length > 1) {
                startAdvertisementCarousel();
            } else if (snapshot.docs.length === 1) {
                document.querySelector('.advertisement-card').classList.add('active');
            }
        } else {
            adContainer.innerHTML = '';
        }
    });

    const allListEl = document.getElementById('all-restaurants-list');
    const featuredListEl = document.getElementById('featured-restaurants-list');

    allRestaurantsCache = [];
    allMenuItemsCache = [];

    const snapshot = await db.collection('restaurants').where("isLocked", "==", false).get();
    if (snapshot.empty) {
        allListEl.innerHTML = '<p>No restaurants available right now.</p>';
        featuredListEl.innerHTML = '<p>No featured restaurants.</p>';
        feather.replace();
        return;
    }

    const menuPromises = snapshot.docs.map(doc => {
        const restaurantData = { id: doc.id, ...doc.data() };
        allRestaurantsCache.push(restaurantData);
        return db.collection('restaurants').doc(doc.id).collection('menu').get().then(menuSnapshot => {
            menuSnapshot.forEach(menuDoc => {
                allMenuItemsCache.push({
                    ...menuDoc.data(),
                    id: menuDoc.id,
                    restaurantId: doc.id,
                    restaurantName: restaurantData.name
                });
            });
        });
    });

    await Promise.all(menuPromises);

    allRestaurantsCache.sort((a, b) => (a.displayPriority || 99) - (b.displayPriority || 99) || (b.avgRating || 0) - (a.avgRating || 0));
    const featuredRestaurants = [...allRestaurantsCache].sort((a,b) => (b.avgRating || 0) - (a.avgRating || 0)).slice(0, 5);

    featuredListEl.innerHTML = featuredRestaurants.map(r => renderFeaturedRestaurantCard({ id: r.id, data: () => r })).join('');
    allListEl.innerHTML = allRestaurantsCache.map(r => renderRestaurantCard({ id: r.id, data: () => r })).join('');

    feather.replace();
}

function startAdvertisementCarousel() {
    const wrapper = document.querySelector('.advertisement-carousel-wrapper');
    const dotsContainer = document.querySelector('.carousel-dots');
    if (!wrapper || !dotsContainer) return;

    const cards = Array.from(wrapper.querySelectorAll('.advertisement-card'));
    const totalCards = cards.length;
    let currentIndex = 0;

    dotsContainer.innerHTML = cards.map((_, index) => `<div class="dot" data-index="${index}"></div>`).join('');
    const dots = dotsContainer.querySelectorAll('.dot');

    const updateCarousel = (newIndex) => {
        currentIndex = newIndex;
        cards.forEach((card, index) => {
            card.classList.remove('active', 'prev', 'next', 'hidden-prev', 'hidden-next');
            dots[index].classList.remove('active');
            if (index === currentIndex) {
                card.classList.add('active');
                dots[index].classList.add('active');
            } else if (index === (currentIndex - 1 + totalCards) % totalCards) {
                card.classList.add('prev');
            } else if (index === (currentIndex + 1) % totalCards) {
                card.classList.add('next');
            } else if (index < currentIndex) {
                card.classList.add('hidden-prev');
            } else {
                card.classList.add('hidden-next');
            }
        });
    };
    
    const autoPlay = () => updateCarousel((currentIndex + 1) % totalCards);
    adSliderInterval = setInterval(autoPlay, 4000);

    dots.forEach(dot => {
        dot.addEventListener('click', () => {
            updateCarousel(parseInt(dot.dataset.index));
            clearInterval(adSliderInterval);
            adSliderInterval = setInterval(autoPlay, 5000);
        });
    });

    updateCarousel(0);
}


function renderFeaturedRestaurantCard(doc) {
    const r = doc.data();
    const firstImage = r.imageUrls && r.imageUrls.length > 0 ? r.imageUrls[0] : 'https://placehold.co/120x120?text=UniFood';
    const isClosed = r.isOpen === false;
    
    return `
        <div data-id="${doc.id}" data-name="${r.name}" data-cuisine="${r.cuisine}" class="featured-restaurant-card flex-shrink-0 ${isClosed ? 'opacity-50' : ''}">
            <div class="img-container relative">
                <img src="${firstImage}" alt="${r.name}">
                ${isClosed ? `<div class="absolute inset-0 bg-black/50 flex items-center justify-center"><span class="text-white font-bold text-sm">CLOSED</span></div>` : ''}
            </div>
            <div class="info mt-2">
                <h3 class="font-semibold text-gray-800">${r.name}</h3>
                <p class="text-sm text-gray-500">${r.cuisine}</p>
            </div>
        </div>`;
}


function renderRestaurantCard(doc) {
    const r = doc.data();
    const firstImage = r.imageUrls && r.imageUrls.length > 0 ? r.imageUrls[0] : 'https://placehold.co/400x250?text=UniFood';
    const isClosed = r.isOpen === false;
    const cardClasses = `restaurant-card group bg-white overflow-hidden cursor-pointer ${isClosed ? 'opacity-60' : ''}`;

    return `
        <div data-id="${doc.id}" data-name="${r.name}" data-cuisine="${r.cuisine}" class="${cardClasses}">
            <div class="overflow-hidden relative">
                <img src="${firstImage}" class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300 ease-in-out">
                ${isClosed ? `<div class="absolute inset-0 bg-black/60 flex items-center justify-center"><span class="text-white font-bold text-xl tracking-widest">CURRENTLY CLOSED</span></div>` : ''}
            </div>
            <div class="p-5">
                <h3 class="font-bold text-xl font-serif">${r.name}</h3>
                <p class="text-sm text-gray-500 mt-1">${r.cuisine}</p>
                <p class="text-sm text-gray-600 truncate mt-1 flex items-center"><i data-feather="map-pin" class="inline-block w-4 h-4 mr-1 flex-shrink-0"></i>${r.address || ''}</p>
                <div class="flex items-center mt-2 text-sm text-gray-700">
                   <i data-feather="star" class="w-4 h-4 fill-current text-yellow-500"></i>
                   <span class="ml-1 font-bold">${(r.avgRating || 0).toFixed(1)}</span>
                   <span class="mx-2">|</span>
                   <span>30-40 min</span>
                </div>
            </div>
        </div>`;
}

function handleGlobalSearch(e) {
    const searchTerm = e.target.value.trim().toLowerCase();
    const activeNav = document.querySelector('#customer-nav .sidebar-link.active');
    
    if (!activeNav) return;
    const currentView = activeNav.dataset.view;

    if (currentView === 'home') {
        searchRestaurantsAndFood(searchTerm);
    } else if (currentView === 'orders') {
        searchOrders(searchTerm);
    }
}

function searchOrders(searchTerm) {
    const ordersList = document.getElementById('customer-orders-list');
    if (!ordersList) return;

    ordersList.querySelectorAll('.order-card').forEach(card => {
        const orderId = card.dataset.orderId.toLowerCase();
        const restaurantName = card.dataset.restaurantName.toLowerCase();
        const itemNames = card.dataset.itemNames.toLowerCase();

        card.style.display = (orderId.includes(searchTerm) || restaurantName.includes(searchTerm) || itemNames.includes(searchTerm)) ? 'block' : 'none';
    });
}

function searchRestaurantsAndFood(searchTerm) {
    const homepageContent = document.getElementById('homepage-content');
    const resultsContainer = document.getElementById('search-results-container');

    if (!searchTerm) {
        homepageContent.classList.remove('hidden');
        resultsContainer.classList.add('hidden');
        resultsContainer.innerHTML = '';
        return;
    }

    homepageContent.classList.add('hidden');
    resultsContainer.classList.remove('hidden');

    const priceRegex = /(.*?)\s*(?:under|<|less than)\s*(\d+)/;
    const priceMatch = searchTerm.match(priceRegex);
    let query = searchTerm;
    let priceLimit = null;

    if (priceMatch) {
        query = priceMatch[1].trim();
        priceLimit = parseFloat(priceMatch[2]);
    }
    
    const matchingRestaurants = allRestaurantsCache.filter(r => 
        r.name.toLowerCase().includes(query) || r.cuisine.toLowerCase().includes(query)
    );

    let matchingItems = allMenuItemsCache.filter(item => 
        item.name.toLowerCase().includes(query) && (priceLimit === null || item.price < priceLimit)
    );
    
    let resultsHtml = '';
    
    if (matchingRestaurants.length > 0) {
        resultsHtml += '<h3 class="text-2xl font-bold font-serif mb-4">Matching Restaurants</h3>';
        resultsHtml += '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">';
        resultsHtml += matchingRestaurants.map(r => renderRestaurantCard({ id: r.id, data: () => r })).join('');
        resultsHtml += '</div>';
    }

    if (matchingItems.length > 0) {
        resultsHtml += '<h3 class="text-2xl font-bold font-serif mt-8 mb-4">Matching Dishes</h3>';
        resultsHtml += '<div class="space-y-4">';
        resultsHtml += matchingItems.map(item => `
            <div class="bg-white rounded-xl shadow-md p-4 flex items-center justify-between gap-4">
                <div>
                    <p class="font-semibold">${item.name}</p>
                    <p class="text-sm text-gray-600">From: <a href="#" class="restaurant-link text-blue-600" data-id="${item.restaurantId}">${item.restaurantName}</a></p>
                </div>
                <p class="font-bold text-lg">₹${item.price}</p>
            </div>
        `).join('');
        resultsHtml += '</div>';
    }

    if (resultsHtml === '') {
        resultsHtml = '<p class="text-center text-gray-500 py-8">No results found.</p>';
    }

    resultsContainer.innerHTML = resultsHtml;
    feather.replace();
    
    resultsContainer.querySelectorAll('.restaurant-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            renderCustomerRestaurantView(e.target.dataset.id);
        });
    });
}

function initializeStickyCategoryBar() {
    const barWrapper = document.getElementById('category-quick-links-wrapper');
    const mainContentArea = document.getElementById('customer-main-content');
    if (!barWrapper) return;

    const placeholder = document.createElement('div');
    placeholder.style.height = `${barWrapper.offsetHeight}px`;
    barWrapper.parentNode.insertBefore(placeholder, barWrapper);

    const onScroll = () => {
        if (!document.getElementById('category-quick-links-wrapper')) {
             window.removeEventListener('scroll', onScroll);
             return;
        }
        const stickyPoint = placeholder.getBoundingClientRect().top;
        const mainContentRect = mainContentArea.getBoundingClientRect();
        if (stickyPoint <= 80) {
            if (!barWrapper.classList.contains('is-fixed')) {
                barWrapper.style.width = `${mainContentRect.width}px`;
                barWrapper.style.left = `${mainContentRect.left}px`;
                barWrapper.classList.add('is-fixed');
            }
        } else {
            if (barWrapper.classList.contains('is-fixed')) {
                barWrapper.classList.remove('is-fixed');
                barWrapper.style.width = '';
                barWrapper.style.left = '';
            }
        }
    };

    window.addEventListener('scroll', onScroll);
    unsubscribeListeners.push(() => window.removeEventListener('scroll', onScroll));
}

async function renderCustomerRestaurantView(restaurantId) {
    const contentArea = document.getElementById('customer-main-content');
    contentArea.innerHTML = `<p>Loading restaurant...</p>`;
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    if (!restaurantDoc.exists) {
        contentArea.innerHTML = `<p>Restaurant not found.</p>`;
        return;
    }
    const restaurant = restaurantDoc.data();
    const isRestaurantClosed = restaurant.isOpen === false;
    const menuSnapshot = await db.collection('restaurants').doc(restaurantId).collection('menu').get();

    let callButtonHtml = '';
    if (restaurant.mobile) {
        callButtonHtml = `
            <a href="tel:${restaurant.mobile}" title="Call Restaurant" class="ml-4 p-2 bg-green-100 text-green-700 rounded-full hover:bg-green-200 transition-colors">
                <i data-feather="phone-call" class="w-5 h-5"></i>
            </a>`;
    } else {
        callButtonHtml = `
            <span title="Phone number not available" class="ml-4 p-2 bg-gray-100 text-gray-400 rounded-full cursor-not-allowed">
                <i data-feather="phone-call" class="w-5 h-5"></i>
            </span>`;
    }

    let menuHtml = '<p class="text-center bg-white p-6 rounded-lg shadow-md">No menu items found for this restaurant.</p>';
    let quickLinksHtml = '';

    if (!menuSnapshot.empty) {
        
        const groupedMenu = {};
        menuSnapshot.docs.forEach(doc => {
            const item = doc.data();
            const category = item.category || 'Miscellaneous'; 
            if (!groupedMenu[category]) {
                groupedMenu[category] = [];
            }
            groupedMenu[category].push(doc);
        });

        const preferredCategoryOrder = ["Starter", "Snacks", "Main Course", "Desserts", "Coldrink"];
        const sortedCategories = Object.keys(groupedMenu).sort((a, b) => {
            const indexA = preferredCategoryOrder.indexOf(a);
            const indexB = preferredCategoryOrder.indexOf(b);
            if (indexA > -1 && indexB > -1) return indexA - indexB;
            if (indexA > -1) return -1;
            if (indexB > -1) return 1;
            return a.localeCompare(b);
        });

        quickLinksHtml = sortedCategories.map(category => {
            const categoryId = category.replace(/\s+/g, '-').toLowerCase();
            return `<a href="#menu-section-${categoryId}" class="quick-link-btn neon-border-secondary">${category}</a>`;
        }).join('');

        menuHtml = sortedCategories.map(category => {
            const categoryId = category.replace(/\s+/g, '-').toLowerCase();
            const itemsHtml = groupedMenu[category].map(doc => {
                const item = doc.data();
                const isAvailable = item.isAvailable !== false;
                const isDisabled = !isAvailable || isRestaurantClosed;
                const itemImage = item.imageUrl || 'https://placehold.co/400x300?text=Food';
                const variants = item.variants && item.variants.length > 0 ? item.variants : [{ name: '', price: item.price }];
                const dietType = item.isVeg ? 'veg' : 'non-veg';
                const dietColor = item.isVeg ? 'border-green-500' : 'border-red-500';

                let mobilePricingHtml;
                if (variants.length > 1) {
                    mobilePricingHtml = `<div class="mt-2 text-sm text-center text-gray-700">Multiple options</div>`;
                } else {
                    mobilePricingHtml = `
                        <div class="flex items-center justify-between mt-3">
                            <p class="font-bold text-lg text-gray-800">₹${variants[0].price}</p>
                            <button 
                                data-action="add-to-cart" data-item-id="${doc.id}" data-item-name="${item.name}" data-item-price="${variants[0].price}" data-restaurant-id="${restaurantId}" data-restaurant-name="${restaurant.name}" 
                                class="btn btn-secondary py-2 px-3 rounded-lg font-semibold flex items-center justify-center gap-2" 
                                ${isDisabled ? 'disabled' : ''}>
                                <i data-feather="plus" class="w-5 h-5"></i>
                            </button>
                        </div>`;
                }
                const mobileCard = `
                    <div data-diet="${dietType}" class="menu-item block md:hidden bg-white rounded-xl shadow-md overflow-hidden transition-shadow hover:shadow-lg flex flex-col cursor-pointer ${isDisabled ? 'opacity-60 bg-gray-50 cursor-not-allowed' : ''}"
                        data-action="view-item-details" data-item-id="${doc.id}" data-restaurant-id="${restaurantId}">
                        <img src="${itemImage}" class="w-full h-32 object-cover">
                        <div class="p-3 flex flex-col flex-grow">
                            <p class="font-bold font-serif flex-grow flex items-center">
                                <span class="w-4 h-4 mr-2 border-2 ${dietColor} flex items-center justify-center">
                                    <span class="w-2 h-2 rounded-full ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}"></span>
                                </span>
                                ${item.name}
                            </p>
                            ${mobilePricingHtml}
                        </div>
                    </div>`;

                let desktopPricingHtml;
                const desktopButtonClasses = "btn btn-secondary py-2 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 w-full md:w-auto md:py-3 md:px-6";
                if (variants.length > 1) {
                    desktopPricingHtml = variants.map(v => {
                        const variantDisplayName = v.name ? ` (${v.name})` : '';
                        const cartItemName = `${item.name}${variantDisplayName}`;
                        return `
                        <div class="flex justify-between items-center py-2 border-t mt-2">
                            <div><p class="font-semibold">${v.name || item.name}</p><p class="font-bold text-lg">₹${v.price}</p></div>
                            <button data-action="add-to-cart" data-item-id="${doc.id}-${v.name}" data-item-name="${cartItemName}" data-item-price="${v.price}" data-restaurant-id="${restaurantId}" data-restaurant-name="${restaurant.name}" class="${desktopButtonClasses}" ${isDisabled ? 'disabled' : ''}>
                                <i data-feather="plus" class="w-5 h-5 hidden md:inline-block"></i><span>Add to Cart</span></button>
                        </div>`;
                    }).join('');
                } else {
                    desktopPricingHtml = `
                        <div class="flex items-center justify-between mt-2">
                            <p class="font-bold text-xl text-gray-800">₹${variants[0].price}</p>
                            <button data-action="add-to-cart" data-item-id="${doc.id}" data-item-name="${item.name}" data-item-price="${variants[0].price}" data-restaurant-id="${restaurantId}" data-restaurant-name="${restaurant.name}" class="${desktopButtonClasses}" ${isDisabled ? 'disabled' : ''}>
                                <i data-feather="plus" class="w-5 h-5 hidden md:inline-block"></i><span>Add to Cart</span></button>
                        </div>`;
                }
                const desktopCard = `
                    <div data-diet="${dietType}" class="menu-item hidden md:flex bg-white rounded-xl shadow-md overflow-hidden transition-shadow hover:shadow-lg items-center gap-4 p-4 cursor-pointer ${isDisabled ? 'opacity-60 bg-gray-50 cursor-not-allowed' : ''}"
                        data-action="view-item-details" data-item-id="${doc.id}" data-restaurant-id="${restaurantId}">
                        <img src="${itemImage}" class="w-24 h-24 object-cover rounded-lg flex-shrink-0">
                        <div class="flex-grow text-left w-full">
                            <p class="font-bold text-lg font-serif flex items-center">
                                <span class="w-4 h-4 mr-2 border-2 ${dietColor} flex items-center justify-center">
                                    <span class="w-2 h-2 rounded-full ${item.isVeg ? 'bg-green-500' : 'bg-red-500'}"></span>
                                </span>
                                ${item.name}
                            </p>
                            <p class="text-sm text-gray-500 mt-1 mb-2">${item.description || ''}</p>
                            <div>${desktopPricingHtml}</div>
                        </div>
                    </div>`;

                return mobileCard + desktopCard;
            }).join('');

            return `
                <div id="menu-section-${categoryId}" class="category-section">
                    <h3 class="text-2xl font-bold font-serif mb-4 pt-4">${category}</h3>
                    <div class="grid grid-cols-2 md:grid-cols-1 gap-4">
                        ${itemsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }
    
    contentArea.innerHTML = `
        <div>
            <button data-action="back-to-home" class="btn bg-white mb-4 flex items-center gap-2"><i data-feather="arrow-left"></i><span>Back to Restaurants</span></button>
            
            <div id="category-quick-links-wrapper">
                 <div class="flex overflow-x-auto gap-3">
                    ${quickLinksHtml}
                </div>
            </div>

            <div class="bg-white rounded-xl shadow-md p-6">
                ${isRestaurantClosed ? `<div class="bg-red-100 text-red-800 p-4 rounded-lg font-bold text-center mb-4">This restaurant is currently closed and not accepting orders.</div>` : ''}
                <div class="flex items-center">
                    <h2 class="text-3xl md:text-4xl font-bold font-serif">${restaurant.name}</h2>
                    ${callButtonHtml}
                </div>
                <p class="text-gray-600 mt-1">${restaurant.cuisine}</p>
                <p class="text-gray-500 mt-2 flex items-center"><i data-feather="map-pin" class="w-4 h-4 mr-2 flex-shrink-0"></i><span>${restaurant.address || ''}</span></p>
                
                <div class="flex items-center gap-4 my-4 p-2 bg-gray-100 rounded-lg">
                    <p class="font-semibold">Show:</p>
                    <button data-filter="all" class="diet-filter-btn active">All</button>
                    <button data-filter="veg" class="diet-filter-btn">Veg</button>
                    <button data-filter="non-veg" class="diet-filter-btn">Non-Veg</button>
                </div>

                <div id="menu-container" class="mt-6 border-t pt-2">
                     ${menuHtml}
                </div>
            </div>
        </div>`;
        
    feather.replace();

    if (quickLinksHtml) {
        initializeStickyCategoryBar();
    }

    const quickLinksContainer = document.getElementById('category-quick-links-wrapper');
    if(quickLinksContainer) {
        quickLinksContainer.addEventListener('click', (e) => {
            const link = e.target.closest('a.quick-link-btn');
            if (!link) return;
            
            e.preventDefault();
            const targetId = link.getAttribute('href');
            const targetElement = document.querySelector(targetId);

            if(targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    }

    const dietFilterContainer = contentArea.querySelector('.diet-filter-btn').parentNode;
    if (dietFilterContainer) {
        dietFilterContainer.addEventListener('click', (e) => {
            const filterBtn = e.target.closest('.diet-filter-btn');
            if (!filterBtn) return;

            dietFilterContainer.querySelectorAll('.diet-filter-btn').forEach(btn => btn.classList.remove('active'));
            filterBtn.classList.add('active');

            const filterType = filterBtn.dataset.filter;
            contentArea.querySelectorAll('.menu-item').forEach(item => {
                if (filterType === 'all' || item.dataset.diet === filterType) {
                    item.classList.remove('filtered-out');
                } else {
                    item.classList.add('filtered-out');
                }
            });
        });
    }
}


async function renderMenuItemDetailView(itemId, restaurantId) {
    const restaurantDoc = await db.collection('restaurants').doc(restaurantId).get();
    const itemDoc = await db.collection('restaurants').doc(restaurantId).collection('menu').doc(itemId).get();

    if (!restaurantDoc.exists || !itemDoc.exists) {
        showSimpleModal("Error", "Item details could not be found.");
        return;
    }

    const restaurant = restaurantDoc.data();
    const item = itemDoc.data();
    const isAvailable = item.isAvailable !== false;
    const isRestaurantClosed = restaurant.isOpen === false;
    const isDisabled = !isAvailable || isRestaurantClosed;
    const itemImage = item.imageUrl || 'https://placehold.co/600x400?text=Food';

    let pricingHtml;
    const variants = item.variants && item.variants.length > 0 ? item.variants : [{ name: '', price: item.price }];
    const buttonClasses = "btn btn-secondary py-2 px-4 rounded-lg font-semibold flex items-center justify-center gap-2";

    if (variants.length > 1) {
        pricingHtml = variants.map(v => `
            <div class="flex flex-col text-center items-center gap-2 md:text-left md:flex-row md:justify-between py-3 border-t">
                <div>
                    <p class="font-semibold">${v.name}</p>
                    <p class="font-bold text-xl">₹${v.price}</p>
                </div>
                <button 
                    data-action="add-to-cart" data-item-id="${itemId}-${v.name}" data-item-name="${item.name} (${v.name})" data-item-price="${v.price}" data-restaurant-id="${restaurantId}" data-restaurant-name="${restaurant.name}" 
                    class="${buttonClasses}" ${isDisabled ? 'disabled' : ''}>
                    <i data-feather="plus" class="w-5 h-5"></i><span>Add to Cart</span></button>
            </div>`).join('');
    } else {
        pricingHtml = `
            <div class="flex flex-col items-center gap-4 md:flex-row md:justify-between mt-4 pt-4 border-t">
                 <p class="font-bold text-2xl text-gray-800">₹${variants[0].price}</p>
                 <button 
                    data-action="add-to-cart" data-item-id="${itemId}" data-item-name="${item.name}" data-item-price="${variants[0].price}" data-restaurant-id="${restaurantId}" data-restaurant-name="${restaurant.name}" 
                    class="${buttonClasses} py-3 px-6" ${isDisabled ? 'disabled' : ''}>
                    <i data-feather="plus" class="w-5 h-5"></i><span>Add to Cart</span></button>
            </div>`;
    }

    const modalHtml = `
      <div class="relative">
        <button onclick="closeModal()" class="absolute top-2 right-2 bg-white/75 backdrop-blur-sm rounded-full p-1 text-gray-800 hover:text-black z-10">
            <i data-feather="x" class="w-6 h-6"></i>
        </button>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div>
                <img src="${itemImage}" class="w-full h-auto object-cover rounded-lg shadow-lg aspect-square">
            </div>
            <div class="flex flex-col h-full">
                <h2 class="text-3xl font-bold font-serif">${item.name}</h2>
                ${isRestaurantClosed ? '<p class="text-red-500 font-semibold mt-2">Restaurant is currently closed.</p>' : ''}
                ${!isAvailable && !isRestaurantClosed ? '<p class="text-red-500 font-semibold mt-2">This item is currently unavailable.</p>' : ''}
                <p class="text-gray-600 mt-2 flex-grow">${item.description || 'No description available.'}</p>
                <div class="mt-4">
                    ${pricingHtml}
                </div>
            </div>
        </div>
      </div>
    `;
    
    showModal(modalHtml);
}


async function renderCustomerOrdersView(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">My Orders</h2>
        <div id="customer-orders-list" class="space-y-4"></div>`;
    const listEl = document.getElementById('customer-orders-list');
    const unsub = db.collection('orders').where('customerId', '==', currentUser.uid)
        .onSnapshot(snapshot => {
            if (snapshot.empty) {
                listEl.innerHTML = `
                    <div class="text-center bg-white p-8 rounded-lg shadow-md">
                        <i data-feather="package" class="w-16 h-16 mx-auto text-gray-400"></i>
                        <h3 class="text-2xl font-bold font-serif mt-4 mb-2">No Orders Yet</h3>
                        <p class="text-gray-600 mb-6">Your past and current orders will appear here.</p>
                        <button data-action="back-to-home" class="btn btn-primary rounded-lg py-3 px-8">Order Now</button>
                    </div>`;
                feather.replace();
                return;
            }
            const sortedDocs = snapshot.docs.sort((a, b) => b.data().createdAt.seconds - a.data().createdAt.seconds);
            listEl.innerHTML = sortedDocs.map(doc => renderCustomerOrderCard(doc.id, doc.data())).join('');
            feather.replace();
        });
    unsubscribeListeners.push(unsub);
}

function renderCustomerOrderCard(orderId, orderData) {
    const statusMap = {
        'placed': { text: 'Order Placed', color: 'bg-gray-500', progress: '20%' },
        'accepted': { text: 'Preparing Food', color: 'bg-blue-500', progress: '40%' },
        'ready-for-pickup': { text: 'Ready for Pickup', color: 'bg-purple-500', progress: '90%' },
        'picked-up': { text: 'On The Way', color: 'bg-yellow-500', progress: '70%' },
        'delivered': { text: 'Delivered', color: 'bg-green-500', progress: '100%' },
        'completed': { text: 'Completed', color: 'bg-green-500', progress: '100%' },
        'cancelled': { text: 'Cancelled', color: 'bg-red-500', progress: '100%' },
    };
    const currentStatus = statusMap[orderData.status] || statusMap['placed'];

    let actionButtons = `<button data-action="view-bill" data-order-id="${orderId}" class="btn btn-primary py-2 px-4">View Bill</button>`;
    
    if (orderData.status === 'delivered' || orderData.status === 'completed') {
        actionButtons += `<button data-action="reorder" data-order-id="${orderId}" class="btn btn-secondary py-2 px-4">Reorder</button>`;
    }
    
    if (orderData.status === 'placed') {
        actionButtons += `<button data-action="cancel-order" data-order-id="${orderId}" class="btn btn-danger py-2 px-4">Cancel</button>`;
    }

    if ((orderData.status === 'delivered' || orderData.status === 'completed') && !orderData.isReviewed) {
        actionButtons += `<button data-action="rate-order" data-order-id="${orderId}" class="btn bg-gray-200 text-gray-800 py-2 px-4">Rate</button>`;
    }

    const itemNames = orderData.items.map(i => i.name).join(' ');

    return `
        <div class="bg-white p-5 rounded-xl shadow-md order-card" 
             data-order-id="${orderId}" 
             data-restaurant-name="${orderData.restaurantName}" 
             data-item-names="${itemNames}">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-bold text-lg">${orderData.restaurantName}</p>
                    <p class="text-sm text-gray-500">Order #${orderId.substring(0,6)}</p>
                </div>
                <p class="font-bold">₹${orderData.totalPrice.toFixed(2)}</p>
            </div>
             <div class="mt-4 border-t pt-4">
                <p class="font-semibold mb-2">Items:</p>
                ${orderData.items.map(item => `<p class="text-sm text-gray-600">${item.quantity} x ${item.name}</p>`).join('')}
            </div>
            <div class="mt-4">
                <p class="font-semibold text-sm mb-1">${currentStatus.text}</p>
                <div class="w-full bg-gray-200 rounded-full h-2.5"><div class="${currentStatus.color} h-2.5 rounded-full" style="width: ${currentStatus.progress}"></div></div>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">${actionButtons}</div>
        </div>`;
}

function renderCustomerProfile(contentArea) {
    contentArea.innerHTML = `
        <h2 class="text-3xl font-bold font-serif mb-6">My Profile</h2>
        <div class="bg-white p-6 rounded-xl shadow-md">
            <form id="customer-profile-form" class="space-y-4">
                <div>
                    <label for="profile-name" class="block text-sm font-medium text-gray-700">Full Name</label>
                    <input type="text" id="profile-name" class="input-field mt-1 block w-full" value="${currentUser.name}" required>
                </div>
                <div>
                    <label for="profile-mobile" class="block text-sm font-medium text-gray-700">Mobile Number</label>
                    <input type="tel" id="profile-mobile" class="input-field mt-1 block w-full" value="${currentUser.mobile}" required>
                </div>
                 <div>
                    <label for="profile-address" class="block text-sm font-medium text-gray-700">Default Delivery Address</label>
                    <textarea id="profile-address" class="input-field mt-1 block w-full" rows="3">${currentUser.address || ''}</textarea>
                </div>
                <button type="submit" class="btn btn-primary py-3 px-6 rounded-lg">Update Profile</button>
            </form>
        </div>`;

    document.getElementById('customer-profile-form').addEventListener('submit', async e => {
        e.preventDefault();
        const { name, mobile, address } = { 
            name: document.getElementById('profile-name').value, 
            mobile: document.getElementById('profile-mobile').value, 
            address: document.getElementById('profile-address').value 
        };
        await db.collection('users').doc(currentUser.uid).update({ name, mobile, address });
        Object.assign(currentUser, { name, mobile, address });
        showSimpleModal('Success', 'Profile updated successfully!');
    });
}

// --- CART LOGIC ---
function addToCart(itemId, itemName, itemPrice, restaurantId, restaurantName, buttonElement) {
    if (cart.length > 0 && cart[0].restaurantId !== restaurantId) {
        showConfirmationModal(
            "Start New Order?",
            "Your cart has items from another restaurant. Clear the cart to add items from this restaurant?",
            () => {
                cart = [{ id: itemId, name: itemName, price: itemPrice, quantity: 1, restaurantId, restaurantName }];
                updateCartButton();
                showToast(`${itemName} added to cart!`);
                if (buttonElement) animateCartButton(buttonElement);
            }
        );
        return;
    }

    const existingItem = cart.find(item => item.id === itemId);
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({ id: itemId, name: itemName, price: itemPrice, quantity: 1, restaurantId, restaurantName });
    }
    updateCartButton();
    showToast(`${itemName} added to cart!`);
    if (buttonElement) animateCartButton(buttonElement);
    localStorage.setItem('unifoodCart', JSON.stringify(cart));
}

function removeFromCart(itemId) {
    const itemIndex = cart.findIndex(item => item.id === itemId);
    if (itemIndex > -1) {
        if (--cart[itemIndex].quantity === 0) cart.splice(itemIndex, 1);
    }
    updateCartButton();
    localStorage.setItem('unifoodCart', JSON.stringify(cart));
    if (cart.length === 0) {
        closeModal();
    } else {
        renderCartView();
    }
}

function updateCartButton() {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCountEl.textContent = totalItems;
    cartButton.classList.toggle('hidden', totalItems === 0);
}

function animateCartButton(button) {
    const originalContent = button.innerHTML;
    button.innerHTML = `<i data-feather="check" class="w-5 h-5"></i> Added`;
    feather.replace();
    button.classList.add('bg-green-500');
    
    if (cartButtonTimeout) clearTimeout(cartButtonTimeout);
    cartButton.classList.add('transform', 'scale-125');

    setTimeout(() => {
        button.innerHTML = originalContent;
        button.classList.remove('bg-green-500');
    }, 1500);

    cartButtonTimeout = setTimeout(() => {
        cartButton.classList.remove('transform', 'scale-125');
    }, 500);
}

async function renderCartView() {
    if (cart.length === 0) {
        const emptyCartHtml = `
            <div class="text-center p-4">
                <i data-feather="shopping-cart" class="w-16 h-16 mx-auto text-gray-400"></i>
                <h3 class="text-2xl font-bold font-serif mt-4 mb-2">Your Cart is Empty</h3>
                <p class="text-gray-600 mb-6">Looks like you haven't added anything to your cart yet.</p>
                <button data-action="back-to-home" class="btn btn-primary rounded-lg py-3 px-8" onclick="closeModal()">Start Shopping</button>
            </div>
        `;
        showModal(emptyCartHtml);
        return;
    }

    const restaurantDoc = await db.collection('restaurants').doc(cart[0].restaurantId).get();
    const restaurantData = restaurantDoc.exists ? restaurantDoc.data() : { supportsDelivery: true };
    const supportsDelivery = restaurantData.supportsDelivery !== false;

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    let deliveryFee = (siteSettings.deliveryChargeType === 'fixed') ? siteSettings.deliveryCharge : subtotal * (siteSettings.deliveryCharge / 100);
    const gst = subtotal * (siteSettings.gstRate / 100);
    let platformFee = (siteSettings.platformFeeType === 'fixed') ? siteSettings.platformFee : subtotal * (siteSettings.platformFee / 100);
    let total = subtotal + deliveryFee + gst + platformFee;
    if (!supportsDelivery) {
        total -= deliveryFee;
    }

    const deliveryOptionsHtml = `
        <div class="mt-6">
            <label class="block text-sm font-medium text-gray-700">Service Type</label>
            <div class="mt-2 flex gap-x-6" id="delivery-type-container">
                <label class="flex items-center ${!supportsDelivery ? 'opacity-50 cursor-not-allowed' : ''}">
                    <input type="radio" name="deliveryType" value="delivery" class="form-radio" ${supportsDelivery ? 'checked' : 'disabled'}>
                    <span class="ml-2 text-sm text-gray-700">Delivery ${!supportsDelivery ? '(Not Available)' : ''}</span>
                </label>
                <label class="flex items-center">
                    <input type="radio" name="deliveryType" value="takeaway" class="form-radio" ${!supportsDelivery ? 'checked' : ''}>
                    <span class="ml-2 text-sm text-gray-700">Takeaway</span>
                </label>
            </div>
        </div>
    `;
    
    const animatedButtonHtml = `
        <button type="button" class="animated-order-btn mt-6">
            <span class="btn-text">Place Order 🍕</span>
            <div class="animation-container">
                <div class="road-lines"></div>
                <svg class="delivery-svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                    <g stroke="#212121" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill-rule="evenodd">
                        <path d="M45 130 C 35 130, 30 120, 40 115 C 30 115, 25 105, 35 100 C 45 100, 50 110, 45 115 Z" fill="#E3F2FD" />
                        <circle cx="65" cy="135" r="18" fill="#FFFFFF"/><circle cx="65" cy="135" r="8" fill="#BDBDBD"/>
                        <circle cx="155" cy="135" r="18" fill="#FFFFFF"/><circle cx="155" cy="135" r="8" fill="#BDBDBD"/>
                        <rect x="35" y="85" width="40" height="30" rx="5" fill="#FFD600"/>
                        <text x="55" y="105" font-family="sans-serif" font-size="10" font-weight="bold" fill="#212121" text-anchor="middle" stroke="none">Unifoods</text>
                        <path d="M165 118 C 158 100, 140 92, 120 92 L90 92 C 85 92 80 97 80 102 L80 115 L60 115 C 50 115 45 125 45 135 L175 135 C 175 125 173 118 165 118 Z" fill="#FFD600"/>
                        <path d="M90 92 C 100 77, 115 72, 130 77 L145 87 L130 95 L90 92 Z" fill="#FBC02D"/>
                        <path d="M128,78 L132,90" fill="none" stroke="#9E9E9E" stroke-width="4"/>
                        <path d="M80 115 L120 115 Q 125 115 125 110 L 125 102 L 80 102 Z" fill="#424242" />
                        <path d="M112 115 L112 135 L95 135 Q 90 135 90 130 L100 115 Z" fill="#37474F"/> 
                        <path d="M88,132 L98,132 L95,140 L90,138 Z" fill="#FFFFFF" />
                        <path d="M88,138 L96,138" fill="none" stroke="#D32F2F" stroke-width="2"/>
                        <path d="M88,132 L98,132" fill="none" stroke="#212121" stroke-width="3"/>
                        <path d="M112,115 L112,85 Q 112 78 118 78 L 130 85 L135 95 L120 105 Z" fill="#4DB6AC" />
                        <path d="M112,85 L118,85" fill="none" stroke-width="1.5"/>
                        <path d="M130,83 C 135,83 137,88 132,90 L128,83 Z" fill="#FFECB3" />
                        <circle cx="110" cy="55" r="15" fill="#FFECB3" />
                        <path d="M95,55 C 95,45 125,45 125,55 L 125,60 C 115,62 105,62 95,60 Z" fill="#424242" />
                        <path d="M120,53 a 3,3 0 0,1 0,6" fill="none" stroke-width="1.5"/>
                        <circle cx="115" cy="53" r="1.5" fill="#212121" />
                        <path d="M112 62 Q 115 64 118 62" fill="none" stroke-width="1.5"/>
                    </g>
                </svg>
            </div>
        </button>
    `;

    const cartHtml = `
        <form id="order-form">
            <h3 class="text-2xl font-bold font-serif mb-4">Your Order</h3>
            <p class="font-semibold mb-4">${cart[0].restaurantName}</p>
            <div class="space-y-3 mb-4 max-h-60 overflow-y-auto">
                ${cart.map(item => `<div class="flex justify-between items-center"><div><p class="font-medium">${item.name}</p><p class="text-sm text-gray-500">Qty: ${item.quantity}</p></div><div class="flex items-center gap-4"><p>₹${(item.price * item.quantity).toFixed(2)}</p><button type="button" data-action="remove-from-cart" data-item-id="${item.id}" class="btn btn-danger p-1 rounded-full"><i data-feather="trash-2" class="w-4 h-4"></i></button></div></div>`).join('')}
            </div>
            <div class="border-t pt-4 space-y-2">
                <div class="flex justify-between"><p>Subtotal</p><p>₹${subtotal.toFixed(2)}</p></div>
                <div id="delivery-fee-line" class="flex justify-between ${!supportsDelivery ? 'hidden' : ''}"><p>Delivery Fee</p><p>₹${deliveryFee.toFixed(2)}</p></div>
                <div class="flex justify-between"><p>Platform Fee</p><p>₹${platformFee.toFixed(2)}</p></div>
                <div class="flex justify-between"><p>GST (${siteSettings.gstRate}%)</p><p>₹${gst.toFixed(2)}</p></div>
                <div class="flex justify-between font-bold text-lg"><p>Grand Total</p><p id="grand-total">₹${total.toFixed(2)}</p></div>
            </div>
            
            ${deliveryOptionsHtml}
            
            <div id="delivery-address-container" class="mt-6 ${!supportsDelivery ? 'hidden' : ''}">
                <label for="delivery-address" class="block text-sm font-medium text-gray-700">Delivery Address</label>
                <textarea id="delivery-address" name="deliveryAddress" class="input-field mt-1 block w-full" rows="3" required>${currentUser.address || ''}</textarea>
            </div>
            <div class="mt-6">
                <label class="block text-sm font-medium text-gray-700">Payment Method</label>
                <div id="payment-method-container" class="mt-2">
                    </div>
            </div>
            <div class="mt-6">
                ${animatedButtonHtml}
                <button type="button" class="btn bg-gray-200 w-full py-3 rounded-full mt-2" onclick="closeModal()">Close</button>
            </div>
        </form>`;
    showModal(cartHtml);
    
    document.getElementById('delivery-type-container').addEventListener('change', (e) => {
        const deliveryFeeLine = document.getElementById('delivery-fee-line');
        const deliveryAddressContainer = document.getElementById('delivery-address-container');
        const grandTotalEl = document.getElementById('grand-total');
        const paymentContainer = document.getElementById('payment-method-container');
        
        let newTotal = subtotal + gst + platformFee;
        
        if (e.target.value === 'delivery') {
            deliveryFeeLine.classList.remove('hidden');
            deliveryAddressContainer.classList.remove('hidden');
            document.getElementById('delivery-address').required = true;
            newTotal += deliveryFee;
            paymentContainer.innerHTML = `
                <div class="flex gap-x-6">
                    <label class="flex items-center">
                        <input type="radio" name="paymentType" value="cod" class="form-radio" checked>
                        <span class="ml-2 text-sm text-gray-700">Cash on Delivery</span>
                    </label>
                    <label class="flex items-center">
                        <input type="radio" name="paymentType" value="online" class="form-radio">
                        <span class="ml-2 text-sm text-gray-700">Online Payment</span>
                    </label>
                </div>`;
        } else { // takeaway
            deliveryFeeLine.classList.add('hidden');
            deliveryAddressContainer.classList.add('hidden');
            document.getElementById('delivery-address').required = false;
            paymentContainer.innerHTML = `
                <div class="p-2 bg-gray-100 rounded-md text-gray-700">
                    <p class="font-semibold">Cash/Online at Counter</p>
                    <input type="hidden" name="paymentType" value="at_counter">
                </div>`;
        }
        grandTotalEl.textContent = `₹${newTotal.toFixed(2)}`;
    });
    
    document.querySelector('input[name="deliveryType"]:checked').dispatchEvent(new Event('change', { 'bubbles': true }));
    
    const animatedOrderBtn = document.querySelector('.animated-order-btn');
    if (animatedOrderBtn) {
        animatedOrderBtn.addEventListener('click', () => {
            const form = document.getElementById('order-form');
            const deliverySvg = animatedOrderBtn.querySelector('.delivery-svg');

            if (animatedOrderBtn.classList.contains('animating')) return;
            
            const deliveryType = form.elements.deliveryType.value;
            const deliveryAddress = form.elements.deliveryAddress.value;
            if (deliveryType === 'delivery' && !deliveryAddress.trim()) {
                showSimpleModal("Address Required", "Delivery address is required for delivery orders.");
                return;
            }

            animatedOrderBtn.classList.add('animating');
            animatedOrderBtn.disabled = true;

            deliverySvg.addEventListener('animationend', () => {
                handlePlaceOrder(form); 
            }, { once: true });
        });
    }
}


async function handlePlaceOrder(form) {
    const deliveryType = form.elements.deliveryType.value;
    const deliveryAddress = form.elements.deliveryAddress.value;
    const paymentMethod = form.elements.paymentType.value;

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = deliveryType === 'delivery' ? ((siteSettings.deliveryChargeType === 'fixed') ? siteSettings.deliveryCharge : subtotal * (siteSettings.deliveryCharge / 100)) : 0;
    const gst = subtotal * (siteSettings.gstRate / 100);
    const platformFee = (siteSettings.platformFeeType === 'fixed') ? siteSettings.platformFee : subtotal * (siteSettings.platformFee / 100);
    const totalPrice = subtotal + deliveryFee + gst + platformFee;

    const orderData = {
        customerId: currentUser.uid, customerName: currentUser.name, 
        restaurantId: cart[0].restaurantId, restaurantName: cart[0].restaurantName,
        items: cart.map(item => ({...item})),
        subtotal, deliveryFee, platformFee, gst, gstRate: siteSettings.gstRate,
        deliveryPayout: 30.00, totalPrice, status: 'placed',
        deliveryType: deliveryType,
        deliveryAddress: deliveryType === 'delivery' ? deliveryAddress : 'Takeaway Order',
        paymentMethod: paymentMethod,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        deliveryBoyId: null, isReviewed: false
    };

    try {
        const docRef = await db.collection('orders').add(orderData);
        await logAudit("Order Placed", `Order ID: ${docRef.id}`);
        showSimpleModal('Order Placed!', 'Your order has been placed successfully.');
        cart = []; 
        updateCartButton(); 
        localStorage.removeItem('unifoodCart');
        closeModal(); 
        renderCustomerView('orders');
    } catch (error) {
        console.error("Error placing order: ", error);
        showSimpleModal('Order Error', 'There was an error placing your order. Please try again.');
        
        const animatedOrderBtn = document.querySelector('.animated-order-btn');
        if (animatedOrderBtn) {
            animatedOrderBtn.classList.remove('animating');
            animatedOrderBtn.disabled = false;
        }
    }
}

async function handleReorder(orderId) {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) {
        showToast("Order not found.", "error");
        return;
    }
    const orderData = orderDoc.data();

    const reorderAction = () => {
        cart = orderData.items.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            restaurantId: orderData.restaurantId,
            restaurantName: orderData.restaurantName
        }));
        localStorage.setItem('unifoodCart', JSON.stringify(cart));
        updateCartButton();
        renderCartView();
    };

    if (cart.length > 0 && cart[0].restaurantId !== orderData.restaurantId) {
        showConfirmationModal(
            "Clear Your Cart?",
            "Reordering will clear your current cart. Do you want to continue?",
            reorderAction
        );
    } else {
        reorderAction();
    }
}

// --- UTILITY, BILLING & RATING FUNCTIONS ---
function handleCancelOrder(orderId) {
    showConfirmationModal(
        "Cancel Order?",
        "Are you sure you want to cancel this order? This action cannot be undone.",
        async () => {
            try {
                await db.collection('orders').doc(orderId).update({ status: 'cancelled' });
                await logAudit("Order Cancelled", `Order ID: ${orderId}`);
                showToast("Order cancelled successfully.", "success");
            } catch (error) {
                console.error("Error cancelling order:", error);
                showSimpleModal("Error", "Could not cancel the order. Please try again.");
            }
        }
    );
}

function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };
    
    toast.className = `flex items-center gap-3 ${colors[type]} text-white py-3 px-5 rounded-lg shadow-lg toast-enter`;
    toast.innerHTML = `
        <i data-feather="check-circle" class="w-6 h-6"></i>
        <span class="font-semibold">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    feather.replace();
    
    setTimeout(() => {
        toast.classList.remove('toast-enter');
        toast.classList.add('toast-exit');
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 3000);
}


async function renderOrderBill(orderId, targetContainer = null) {
    const orderDoc = await db.collection('orders').doc(orderId).get();
    if (!orderDoc.exists) { showSimpleModal("Error", "Order not found."); return; }
    const order = orderDoc.data();
    const restaurant = (await db.collection('restaurants').doc(order.restaurantId).get()).data();
    const customer = (await db.collection('users').doc(order.customerId).get()).data();

    const billHtml = `
        <div id="printable-bill"><div class="p-6 bg-white">
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
                <p>${order.customerName}</p><p>${order.deliveryAddress}</p>
                <p>Email: ${customer.email}</p><p>Mobile: ${customer.mobile || 'N/A'}</p>
                <p class="mt-2"><strong>Payment Method:</strong> <span class="capitalize">${order.paymentMethod || 'N/A'}</span></p>
                <p><strong>Service Type:</strong> <span class="capitalize">${order.deliveryType || 'Delivery'}</span></p>
            </div>
            <table class="w-full text-sm my-6">
                <thead class="border-b bg-gray-50"><tr><th class="text-left p-2">Item</th><th class="text-center p-2">Qty</th><th class="text-right p-2">Price</th><th class="text-right p-2">Total</th></tr></thead>
                <tbody>${order.items.map(item => `<tr class="border-b"><td class="p-2">${item.name}</td><td class="text-center p-2">${item.quantity}</td><td class="text-right p-2">₹${item.price.toFixed(2)}</td><td class="text-right p-2">₹${(item.price * item.quantity).toFixed(2)}</td></tr>`).join('')}</tbody>
                <tfoot class="font-semibold">
                    <tr><td colspan="3" class="text-right p-2 border-t">Subtotal</td><td class="text-right p-2 border-t">₹${order.subtotal.toFixed(2)}</td></tr>
                    <tr><td colspan="3" class="text-right p-2">Delivery Fee</td><td class="text-right p-2">₹${(order.deliveryFee || 0).toFixed(2)}</td></tr>
                    <tr><td colspan="3" class="text-right p-2">Platform Fee</td><td class="text-right p-2">₹${(order.platformFee || 0).toFixed(2)}</td></tr>
                    <tr><td colspan="3" class="text-right p-2">GST (${order.gstRate || siteSettings.gstRate}%)</td><td class="text-right p-2">₹${order.gst.toFixed(2)}</td></tr>
                    <tr class="text-xl font-bold border-t-2 bg-gray-100"><td colspan="3" class="text-right p-2">Grand Total</td><td class="text-right p-2">₹${order.totalPrice.toFixed(2)}</td></tr>
                </tfoot>
            </table>
            <p class="text-center text-xs text-gray-500">Thank you for your order!</p>
        </div></div>
        <div class="flex justify-end gap-4 mt-4"><button class="btn bg-gray-200" onclick="closeModal()">Close</button><button class="btn btn-primary" onclick="downloadBillAsPDF('${orderId}')">Download Bill</button></div>`;
    
    targetContainer ? targetContainer.innerHTML = billHtml : showModal(billHtml);
    new QRCode(document.getElementById("qrcode-container"), { text: orderId, width: 80, height: 80 });
}

function downloadBillAsPDF(orderId) {
    const element = document.getElementById('printable-bill');
    const opt = { margin: 0.5, filename: `UniFood_Invoice_${orderId.substring(0,8)}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
    html2pdf().from(element).set(opt).save();
}
        
async function showRatingForm(orderId) {
    const order = (await db.collection('orders').doc(orderId).get()).data();
    const deliveryPersonName = order.deliveryBoyName || (order.deliveryType === 'takeaway' ? 'Restaurant Staff' : 'UniFood Delivery');

    const formHtml = `
        <form id="rating-form" class="space-y-6">
            <h3 class="text-2xl font-bold font-serif mb-4">Rate Your Order</h3>
            <div class="p-4 border rounded-lg"><p class="font-semibold">Rate the Restaurant: ${order.restaurantName}</p><div class="rating flex items-center text-3xl" data-type="restaurant">${[...Array(5)].map((_,i)=>`<span class="star" data-value="${i+1}"><i data-feather="star"></i></span>`).join('')}</div><textarea name="restaurantReview" class="input-field w-full mt-2" rows="2" placeholder="Tell us about the food..."></textarea></div>
            <div class="p-4 border rounded-lg"><p class="font-semibold">Rate the Service by: ${deliveryPersonName}</p><div class="rating flex items-center text-3xl" data-type="delivery">${[...Array(5)].map((_,i)=>`<span class="star" data-value="${i+1}"><i data-feather="star"></i></span>`).join('')}</div><textarea name="deliveryReview" class="input-field w-full mt-2" rows="2" placeholder="How was the delivery/pickup experience?"></textarea></div>
            <input type="hidden" name="restaurantRating" value="0"><input type="hidden" name="deliveryRating" value="0">
            <div class="flex justify-end gap-4 pt-4"><button type="button" class="btn bg-gray-200" onclick="closeModal()">Skip</button><button type="submit" class="btn btn-primary">Submit Review</button></div>
        </form>`;
    showModal(formHtml);
    
    document.querySelectorAll('.rating .star').forEach(star => {
        star.addEventListener('click', () => {
            const container = star.parentElement; const type = container.dataset.type; const value = parseInt(star.dataset.value);
            document.querySelector(`input[name="${type}Rating"]`).value = value;
            container.querySelectorAll('.star').forEach(s => {
                const sValue = parseInt(s.dataset.value);
                s.classList.toggle('selected', sValue <= value); s.querySelector('i').style.fill = sValue <= value ? '#f59e0b' : 'none';
            });
        });
    });
    document.getElementById('rating-form').addEventListener('submit', e => handlePostReview(e, orderId, order));
}

async function handlePostReview(e, orderId, orderData) {
    e.preventDefault();
    const form = e.target;
    const restaurantRating = parseInt(form.elements.restaurantRating.value);
    const deliveryRating = parseInt(form.elements.deliveryRating.value);
    if (restaurantRating === 0 || deliveryRating === 0) {
        showSimpleModal("Rating Required", "Please select a star rating for both the restaurant and the service.");
        return;
    }

    const reviewData = {
        orderId,
        customerId: currentUser.uid,
        customerName: currentUser.name,
        restaurantId: orderData.restaurantId,
        restaurantName: orderData.restaurantName,
        deliveryBoyId: orderData.deliveryBoyId || null, // FIXED: Use null instead of undefined
        deliveryBoyName: orderData.deliveryBoyName || null, // FIXED: Use null instead of undefined
        restaurantRating,
        restaurantReview: form.elements.restaurantReview.value,
        deliveryRating,
        deliveryReview: form.elements.deliveryReview.value,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('reviews').add(reviewData);
        await db.collection('orders').doc(orderId).update({ isReviewed: true });

        const updateAvgRating = async (collection, docId, newRating) => {
            if (!docId) return;
            const ref = db.collection(collection).doc(docId);
            return db.runTransaction(async (transaction) => {
                const doc = await transaction.get(ref);
                if (!doc.exists) return;
                const data = doc.data();
                const currentRating = data.avgRating || 0;
                const ratingCount = data.ratingCount || 0;
                const newAvg = (currentRating * ratingCount + newRating) / (ratingCount + 1);
                transaction.update(ref, { 
                    avgRating: newAvg, 
                    ratingCount: firebase.firestore.FieldValue.increment(1) 
                });
            });
        };
        
        await updateAvgRating('restaurants', orderData.restaurantId, restaurantRating);
        if (orderData.deliveryBoyId) {
            await updateAvgRating('users', orderData.deliveryBoyId, deliveryRating);
        }
        
        await logAudit("Review Submitted", `Order ID: ${orderId}`);
        showSimpleModal("Thank You!", "Your review has been submitted.");
        closeModal();
    } catch (error) {
        console.error("[FATAL] Error during post-review process:", error);
        showSimpleModal("Error", "There was a problem submitting your review. Please try again.");
    }
}

function showModal(contentHtml) {
    modalContainer.innerHTML = `<div class="modal-content">${contentHtml}</div>`;
    modalContainer.classList.add('active');
    feather.replace();
}

function showSimpleModal(title, message, onOk) {
    showModal(`<div class="text-center"><h3 class="text-2xl font-bold font-serif mb-2">${title}</h3><p class="text-gray-600 mb-6">${message}</p><button id="simple-modal-ok" class="btn btn-primary rounded-lg py-2 px-12">OK</button></div>`);
    document.getElementById('simple-modal-ok').addEventListener('click', () => { if (onOk) onOk(); closeModal(); });
}

function showConfirmationModal(title, message, onConfirm, onCancel) {
    showModal(`<div class="text-center"><h3 class="text-2xl font-bold font-serif mb-2">${title}</h3><p class="text-gray-600 mb-6">${message}</p><div class="flex justify-center gap-4"><button id="confirm-cancel" class="btn bg-gray-200 rounded-lg py-2 px-8">Cancel</button><button id="confirm-ok" class="btn btn-danger rounded-lg py-2 px-8">Confirm</button></div></div>`);
    document.getElementById('confirm-ok').addEventListener('click', () => { if (onConfirm) onConfirm(); closeModal(); });
    document.getElementById('confirm-cancel').addEventListener('click', () => { if (onCancel) onCancel(); closeModal(); });
}

function closeModal() {
    if (document.getElementById('qr-reader') && html5QrCode && html5QrCode.isScanning) stopScanner();
    modalContainer.classList.remove('active');
    modalContainer.innerHTML = '';
}

function cleanupListeners() {
    unsubscribeListeners.forEach(unsub => unsub());
    unsubscribeListeners = [];
    if (html5QrCode && html5QrCode.isScanning) stopScanner();
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
    setTimeout(() => { mobileMenuOverlay.classList.add('hidden'); }, 300);
}

mobileMenuButton.addEventListener('click', openMobileMenu);
closeMobileMenuButton.addEventListener('click', closeMobileMenu);
mobileMenuOverlay.addEventListener('click', (e) => { if (e.target === mobileMenuOverlay) closeMobileMenu(); });

// --- INITIALIZE APP ON LOAD ---
document.addEventListener('DOMContentLoaded', initializeApp);

const handleLogout = () => {
    cleanupListeners();
    auth.signOut().then(() => { window.location.reload(); });
};

logoutBtn.addEventListener('click', handleLogout);
mobileLogoutBtn.addEventListener('click', handleLogout);

// --- AI CHATBOT SCRIPT ---
const chatbotToggle = document.getElementById('chatbot-toggle');
const chatbotWindow = document.getElementById('chatbot-window');
const chatbotInput = document.getElementById('chatbot-input');
const chatbotMessages = document.getElementById('chatbot-messages');

chatbotToggle.addEventListener('click', () => chatbotWindow.classList.toggle('hidden'));
chatbotInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.target.value.trim() !== '') {
        const userMessage = e.target.value.trim();
        appendMessage(userMessage, 'user');
        e.target.value = '';
        getAiResponse(userMessage);
    }
});

function appendMessage(text, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `text-sm p-2 rounded-lg mb-2 ${sender === 'user' ? 'bg-blue-500 text-white ml-auto' : 'bg-gray-100'}`;
    messageDiv.style.maxWidth = '80%';
    messageDiv.textContent = text;
    chatbotMessages.appendChild(messageDiv);
    chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
}

function getAiResponse(message) {
    const lowerCaseMessage = message.toLowerCase();
    let response = "I'm not sure how to answer that. Try asking about orders, restaurants, or your profile.";
    if (lowerCaseMessage.includes("track my order")) response = "Sure! Can you please provide the order ID?";
    else if (lowerCaseMessage.includes("help")) response = `I can help with tracking orders, finding restaurants, and answering questions about your account. What do you need assistance with?`;
    else if (lowerCaseMessage.includes("best restaurants")) response = "Based on your recent orders, I recommend trying 'The Pizza Palace' or 'Curry Kingdom'.";
    else if (lowerCaseMessage.includes("how to add menu item") && currentUser?.role === 'restaurant') response = "Go to 'Menu Management' in your portal and click the 'Add Item' button. I can guide you through the steps if you'd like!";
    setTimeout(() => { appendMessage(response, 'ai'); }, 500);
}

feather.replace();
