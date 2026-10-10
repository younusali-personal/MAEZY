/**
 * MAEZY JEWELS — LUXURY E-COMMERCE ENGINE (maezy-core.js)
 * Multi-Currency, Persistent Bag, Wishlist, QuickView Modal, Toast & Search
 */

(function () {
  'use strict';

  // State Management
  const STORAGE_KEYS = {
    CART: 'maezy_luxury_cart',
    WISHLIST: 'maezy_luxury_wishlist',
    CURRENCY: 'maezy_currency',
    DISCOUNT: 'maezy_applied_discount',
    DIRECTION: 'maezy_direction'
  };

  // Currency Exchange Rates (Base: INR)
  const CURRENCIES = {
    INR: { symbol: '₹', rate: 1.0, label: 'INR (₹)' },
    USD: { symbol: '$', rate: 0.012, label: 'USD ($)' },
    EUR: { symbol: '€', rate: 0.011, label: 'EUR (€)' },
    GBP: { symbol: '£', rate: 0.0095, label: 'GBP (£)' },
    AED: { symbol: 'AED ', rate: 0.044, label: 'AED (AED)' }
  };

  // Verified Pre-launch Promo Codes
  const PROMO_CODES = {
    'MAEZYVIP': { discountPercent: 10, label: '10% Pre-Launch Privilege' },
    'PRELAUNCH': { discountPercent: 10, label: '10% Pre-Launch Drop' },
    'FIRST10': { discountPercent: 10, label: '10% First Order Welcome' },
    'LUXURY20': { discountPercent: 20, minSpend: 7000, label: '20% Couture Privilege' }
  };

  // Free shipping threshold in INR
  const FREE_SHIPPING_THRESHOLD_INR = 3500;

  // Global App State
  window.MaezyApp = {
    products: [],
    cart: {}, // { productId: { qty: 1, size: 'Adjustable' } }
    wishlist: [], // [ productId, ... ]
    currency: localStorage.getItem(STORAGE_KEYS.CURRENCY) || 'INR',
    discount: null, // { code: 'MAEZYVIP', percent: 10 }
    direction: localStorage.getItem(STORAGE_KEYS.DIRECTION) || 'alabaster',

    // Init Engine
    async init() {
      this.initDirection();
      this.loadCart();
      this.loadWishlist();
      this.loadDiscount();
      await this.loadProducts();
      this.bindGlobalEvents();
      this.renderCartUI();
      this.renderWishlistUI();
      this.updateHeaderBadges();
      this.injectGlobalDrawers();
      
      // Notify page scripts that products are ready
      window.dispatchEvent(new CustomEvent('maezy:ready', { detail: { products: this.products } }));
    },

    // Visual Direction Switcher (Direction 1: Alabaster vs Direction 2: Obsidian)
    initDirection() {
      const saved = localStorage.getItem(STORAGE_KEYS.DIRECTION) || 'alabaster';
      this.setDirection(saved, false);
    },

    setDirection(themeName, showToast = true) {
      this.direction = themeName;
      localStorage.setItem(STORAGE_KEYS.DIRECTION, themeName);
      if (themeName === 'obsidian') {
        document.documentElement.setAttribute('data-theme', 'obsidian');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      document.querySelectorAll('[data-direction-toggle]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.directionToggle === themeName);
      });
      if (showToast) {
        const label = themeName === 'obsidian' ? 'Direction 2: Velvet Obsidian' : 'Direction 1: Atelier Alabaster';
        this.showToast(`Switched aesthetic to ${label}`);
      }
    },

    // Fetch Products Catalog
    async loadProducts() {
      try {
        const res = await fetch('products.json');
        if (!res.ok) throw new Error('Catalog fetch error');
        this.products = await res.json();
      } catch (err) {
        console.warn('Fallback product loader:', err);
      }
    },

    // Format Currency Helper
    formatMoney(amountInINR) {
      const curr = CURRENCIES[this.currency] || CURRENCIES.INR;
      const converted = Math.round(amountInINR * curr.rate);
      if (this.currency === 'INR') {
        return '₹' + new Intl.NumberFormat('en-IN').format(converted);
      }
      return `${curr.symbol}${new Intl.NumberFormat('en-US').format(converted)}`;
    },

    setCurrency(currCode) {
      if (!CURRENCIES[currCode]) return;
      this.currency = currCode;
      localStorage.setItem(STORAGE_KEYS.CURRENCY, currCode);
      this.renderCartUI();
      this.renderWishlistUI();
      window.dispatchEvent(new CustomEvent('maezy:currencyChange', { detail: { currency: currCode } }));
      this.showToast(`Currency updated to ${currCode}`);
    },

    // Cart Operations
    loadCart() {
      try {
        this.cart = JSON.parse(localStorage.getItem(STORAGE_KEYS.CART) || '{}');
      } catch (e) {
        this.cart = {};
      }
    },

    saveCart() {
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(this.cart));
      this.updateHeaderBadges();
      this.renderCartUI();
      window.dispatchEvent(new CustomEvent('maezy:cartUpdated', { detail: { cart: this.cart } }));
    },

    addToCart(productId, qty = 1, size = null) {
      const product = this.products.find(p => p.id === productId);
      if (!product) return;

      if (!this.cart[productId]) {
        this.cart[productId] = { qty: 0, size: size || product.size || null };
      }
      this.cart[productId].qty = Math.min(10, this.cart[productId].qty + qty);
      this.saveCart();
      this.showToast(`Added "${product.name}" to Bag`, 'success');
      this.openCart();
    },

    updateCartQty(productId, newQty) {
      if (!this.cart[productId]) return;
      if (newQty <= 0) {
        delete this.cart[productId];
      } else {
        this.cart[productId].qty = Math.min(10, newQty);
      }
      this.saveCart();
    },

    removeFromCart(productId) {
      if (this.cart[productId]) {
        const name = this.products.find(p => p.id === productId)?.name || 'Item';
        delete this.cart[productId];
        this.saveCart();
        this.showToast(`Removed "${name}" from Bag`);
      }
    },

    getCartCount() {
      return Object.values(this.cart).reduce((sum, item) => sum + (item.qty || 0), 0);
    },

    getCartSubtotalINR() {
      let subtotal = 0;
      for (const [id, item] of Object.entries(this.cart)) {
        const prod = this.products.find(p => p.id === id);
        if (prod) {
          subtotal += prod.price * item.qty;
        }
      }
      return subtotal;
    },

    getCartDiscountAmountINR() {
      if (!this.discount) return 0;
      const subtotal = this.getCartSubtotalINR();
      return Math.round((subtotal * this.discount.percent) / 100);
    },

    getCartFinalTotalINR() {
      const subtotal = this.getCartSubtotalINR();
      const discount = this.getCartDiscountAmountINR();
      return Math.max(0, subtotal - discount);
    },

    // Discount / Promo
    loadDiscount() {
      try {
        this.discount = JSON.parse(localStorage.getItem(STORAGE_KEYS.DISCOUNT) || 'null');
      } catch (e) {
        this.discount = null;
      }
    },

    applyPromoCode(code) {
      const cleanCode = (code || '').trim().toUpperCase();
      const promo = PROMO_CODES[cleanCode];
      if (!promo) {
        this.showToast('Invalid promo code. Try MAEZYVIP', 'error');
        return false;
      }
      const subtotal = this.getCartSubtotalINR();
      if (promo.minSpend && subtotal < promo.minSpend) {
        this.showToast(`Code requires minimum spend of ₹${promo.minSpend}`, 'error');
        return false;
      }

      this.discount = { code: cleanCode, percent: promo.discountPercent, label: promo.label };
      localStorage.setItem(STORAGE_KEYS.DISCOUNT, JSON.stringify(this.discount));
      this.saveCart();
      this.showToast(`Privilege applied: ${promo.label}!`, 'success');
      return true;
    },

    removeDiscount() {
      this.discount = null;
      localStorage.removeItem(STORAGE_KEYS.DISCOUNT);
      this.saveCart();
      this.showToast('Promo code removed');
    },

    // Wishlist Operations
    loadWishlist() {
      try {
        this.wishlist = JSON.parse(localStorage.getItem(STORAGE_KEYS.WISHLIST) || '[]');
      } catch (e) {
        this.wishlist = [];
      }
    },

    saveWishlist() {
      localStorage.setItem(STORAGE_KEYS.WISHLIST, JSON.stringify(this.wishlist));
      this.updateHeaderBadges();
      this.renderWishlistUI();
      window.dispatchEvent(new CustomEvent('maezy:wishlistUpdated', { detail: { wishlist: this.wishlist } }));
    },

    toggleWishlist(productId) {
      const product = this.products.find(p => p.id === productId);
      const idx = this.wishlist.indexOf(productId);
      if (idx > -1) {
        this.wishlist.splice(idx, 1);
        this.saveWishlist();
        this.showToast(`Removed from Wishlist`);
      } else {
        this.wishlist.push(productId);
        this.saveWishlist();
        this.showToast(`Saved "${product?.name || 'Item'}" to Wishlist`, 'success');
      }
      // Update heart icon states on page
      document.querySelectorAll(`[data-wishlist-id="${productId}"]`).forEach(btn => {
        btn.classList.toggle('active', this.isWishlisted(productId));
      });
    },

    isWishlisted(productId) {
      return this.wishlist.includes(productId);
    },

    // Header Badges
    updateHeaderBadges() {
      const cartCount = this.getCartCount();
      const wishlistCount = this.wishlist.length;

      document.querySelectorAll('.bag-count-badge').forEach(el => {
        el.textContent = cartCount;
        el.style.display = cartCount > 0 ? 'flex' : 'none';
      });

      document.querySelectorAll('.wishlist-count-badge').forEach(el => {
        el.textContent = wishlistCount;
        el.style.display = wishlistCount > 0 ? 'flex' : 'none';
      });
    },

    // Global Drawer Controls
    openCart() {
      document.getElementById('cart-drawer-root')?.classList.add('active');
      document.getElementById('global-drawer-backdrop')?.classList.add('active');
      this.renderCartUI();
    },

    closeCart() {
      document.getElementById('cart-drawer-root')?.classList.remove('active');
      document.getElementById('global-drawer-backdrop')?.classList.remove('active');
    },

    openWishlist() {
      document.getElementById('wishlist-drawer-root')?.classList.add('active');
      document.getElementById('global-drawer-backdrop')?.classList.add('active');
      this.renderWishlistUI();
    },

    closeWishlist() {
      document.getElementById('wishlist-drawer-root')?.classList.remove('active');
      document.getElementById('global-drawer-backdrop')?.classList.remove('active');
    },

    closeAllDrawers() {
      this.closeCart();
      this.closeWishlist();
      this.closeQuickView();
      this.closeSearchModal();
      document.getElementById('mobile-nav-drawer')?.classList.remove('active');
    },

    // Render Cart Drawer
    renderCartUI() {
      const itemsContainer = document.getElementById('cart-items-list');
      const footerContainer = document.getElementById('cart-footer-content');
      const progressFill = document.getElementById('shipping-progress-fill');
      const progressText = document.getElementById('shipping-progress-text');

      if (!itemsContainer || !footerContainer) return;

      const cartEntries = Object.entries(this.cart);
      const subtotalINR = this.getCartSubtotalINR();

      // Free shipping bar
      if (progressFill && progressText) {
        const remaining = FREE_SHIPPING_THRESHOLD_INR - subtotalINR;
        if (subtotalINR >= FREE_SHIPPING_THRESHOLD_INR && cartEntries.length > 0) {
          progressFill.style.width = '100%';
          progressText.innerHTML = `<span>✧ Complimentary Insured White-Glove Shipping Unlocked!</span>`;
        } else if (cartEntries.length === 0) {
          progressFill.style.width = '0%';
          progressText.innerHTML = `<span>Add ${this.formatMoney(FREE_SHIPPING_THRESHOLD_INR)} for Complimentary Insured Shipping</span>`;
        } else {
          const pct = Math.min(100, Math.round((subtotalINR / FREE_SHIPPING_THRESHOLD_INR) * 100));
          progressFill.style.width = `${pct}%`;
          progressText.innerHTML = `<span>Add <strong>${this.formatMoney(remaining)}</strong> more for Complimentary Insured Shipping</span> <span>${pct}%</span>`;
        }
      }

      if (cartEntries.length === 0) {
        itemsContainer.innerHTML = `
          <div class="empty-cart-view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            <h4>Your Bag is Empty</h4>
            <p>Discover our pre-launch collection and treat yourself to something truly extraordinary.</p>
            <a href="collection.html" class="btn btn-primary btn-sm" onclick="MaezyApp.closeCart()">EXPLORE PIECES ↗</a>
          </div>
        `;
        footerContainer.style.display = 'none';
        return;
      }

      footerContainer.style.display = 'block';

      // Items list
      itemsContainer.innerHTML = cartEntries.map(([id, item]) => {
        const prod = this.products.find(p => p.id === id);
        if (!prod) return '';
        return `
          <div class="cart-item-row" data-cart-item="${id}">
            <div class="cart-item-thumb">
              <img src="${prod.image}" alt="${prod.name}">
            </div>
            <div class="cart-item-details">
              <div>
                <h4><a href="product.html?id=${prod.id}">${prod.name}</a></h4>
                <div class="cart-item-spec">${prod.category} ${item.size ? `· Size: ${item.size}` : ''}</div>
                <div class="cart-item-price">${this.formatMoney(prod.price * item.qty)}</div>
              </div>
              <div class="cart-item-actions">
                <div class="qty-control">
                  <button class="qty-btn" onclick="MaezyApp.updateCartQty('${id}', ${item.qty - 1})">−</button>
                  <span class="qty-val">${item.qty}</span>
                  <button class="qty-btn" onclick="MaezyApp.updateCartQty('${id}', ${item.qty + 1})" ${item.qty >= 10 ? 'disabled' : ''}>+</button>
                </div>
                <button class="remove-item-btn" onclick="MaezyApp.removeFromCart('${id}')">Remove</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Cart Footer Totals
      const discountINR = this.getCartDiscountAmountINR();
      const finalINR = this.getCartFinalTotalINR();

      footerContainer.innerHTML = `
        <div class="promo-apply-row">
          <input type="text" id="cart-promo-input" placeholder="Privilege Code (MAEZYVIP)" value="${this.discount ? this.discount.code : ''}">
          <button class="btn btn-outline btn-sm" onclick="MaezyApp.handleApplyPromo()">APPLY</button>
        </div>
        ${this.discount ? `
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#2E7D32; margin-bottom:12px; font-weight:600;">
            <span>✓ ${this.discount.label}</span>
            <button onclick="MaezyApp.removeDiscount()" style="color:#8C4D55; text-decoration:underline; font-size:10px;">Remove</button>
          </div>
        ` : `
          <div style="margin-bottom:14px; font-size:11px; color:var(--text-muted);">
            Suggested: <span class="promo-pill" onclick="MaezyApp.applyPromoCode('MAEZYVIP')">MAEZYVIP (10% OFF)</span>
          </div>
        `}
        <div class="cart-totals-breakdown">
          <div class="totals-row">
            <span>Catalogue Subtotal</span>
            <span>${this.formatMoney(subtotalINR)}</span>
          </div>
          ${this.discount ? `
            <div class="totals-row" style="color:#2E7D32; font-weight:600;">
              <span>Pre-Launch Savings (-${this.discount.percent}%)</span>
              <span>-${this.formatMoney(discountINR)}</span>
            </div>
          ` : ''}
          <div class="totals-row">
            <span>Insured White-Glove Shipping</span>
            <span>${subtotalINR >= FREE_SHIPPING_THRESHOLD_INR ? 'COMPLIMENTARY' : this.formatMoney(250)}</span>
          </div>
          <div class="totals-row final-total">
            <span>Estimated Total</span>
            <span>${this.formatMoney(finalINR + (subtotalINR >= FREE_SHIPPING_THRESHOLD_INR ? 0 : 250))}</span>
          </div>
        </div>
        <a href="checkout.html" class="btn btn-primary btn-full" style="padding:18px;">
          PROCEED TO LUXURY CHECKOUT 🔒
        </a>
        <p style="text-align:center; font-size:10px; color:var(--text-muted); margin-top:10px; letter-spacing:0.5px;">
          256-Bit Encrypted • Complimentary Velvet Packaging
        </p>
      `;
    },

    handleApplyPromo() {
      const input = document.getElementById('cart-promo-input');
      if (input) this.applyPromoCode(input.value);
    },

    // Render Wishlist Drawer
    renderWishlistUI() {
      const listEl = document.getElementById('wishlist-items-list');
      if (!listEl) return;

      if (this.wishlist.length === 0) {
        listEl.innerHTML = `
          <div class="empty-cart-view">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
            <h4>Your Wishlist is Empty</h4>
            <p>Tap the heart icon on any jewel to preserve your most beloved pieces.</p>
            <a href="collection.html" class="btn btn-outline btn-sm" onclick="MaezyApp.closeWishlist()">EXPLORE CREATIONS ↗</a>
          </div>
        `;
        return;
      }

      listEl.innerHTML = this.wishlist.map(id => {
        const prod = this.products.find(p => p.id === id);
        if (!prod) return '';
        return `
          <div class="cart-item-row">
            <div class="cart-item-thumb">
              <img src="${prod.image}" alt="${prod.name}">
            </div>
            <div class="cart-item-details">
              <div>
                <h4><a href="product.html?id=${prod.id}">${prod.name}</a></h4>
                <div class="cart-item-spec">${prod.category}</div>
                <div class="cart-item-price">${this.formatMoney(prod.price)}</div>
              </div>
              <div class="cart-item-actions">
                <button class="btn btn-primary btn-sm" onclick="MaezyApp.addToCart('${prod.id}'); MaezyApp.toggleWishlist('${prod.id}')" style="padding:6px 14px; font-size:9px;">
                  MOVE TO BAG
                </button>
                <button class="remove-item-btn" onclick="MaezyApp.toggleWishlist('${prod.id}')">Remove</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    // Quick View Modal
    openQuickView(productId) {
      const prod = this.products.find(p => p.id === productId);
      if (!prod) return;

      const modalEl = document.getElementById('quickview-card-content');
      if (!modalEl) return;

      modalEl.innerHTML = `
        <div class="quickview-grid">
          <div class="quickview-gallery">
            <img src="${prod.image}" alt="${prod.name}">
          </div>
          <div class="quickview-body">
            <span class="eyebrow">${prod.category} · PRE-LAUNCH EDIT</span>
            <h2 class="quickview-title">${prod.name}</h2>
            <div class="quickview-price-tag">${this.formatMoney(prod.price)} <small style="font-size:11px; color:var(--text-muted); font-weight:normal;">MRP (INCL. TAXES)</small></div>
            <p class="quickview-description">${prod.description}</p>
            
            <div class="specs-badge-list">
              <span class="spec-badge-chip">✧ ${prod.stoneType || '5A Cubic Zirconia'}</span>
              <span class="spec-badge-chip">✧ ${prod.plating || 'Rhodium Micron Plated'}</span>
              <span class="spec-badge-chip">✧ Hypoallergenic & Nickel-Free</span>
            </div>

            ${prod.size ? `
              <div style="margin-bottom:18px;">
                <label style="display:block; font-size:11px; text-transform:uppercase; font-weight:700; margin-bottom:6px; letter-spacing:1px;">Ring Sizing</label>
                <span class="spec-badge-chip" style="background:var(--rose-subtle); color:var(--rose-primary); font-weight:600;">${prod.size}</span>
              </div>
            ` : ''}

            <div class="quickview-cta-row">
              <button class="btn btn-primary btn-full" onclick="MaezyApp.addToCart('${prod.id}'); MaezyApp.closeQuickView();">
                ADD TO BAG · ${this.formatMoney(prod.price)}
              </button>
              <button class="btn btn-outline" onclick="MaezyApp.toggleWishlist('${prod.id}')" style="padding:16px 20px;">
                ♥
              </button>
            </div>

            <div style="margin-top:24px; text-align:center;">
              <a href="product.html?id=${prod.id}" class="link-luxury">VIEW COMPLETE CREATION DETAILS ↗</a>
            </div>
          </div>
        </div>
      `;

      document.getElementById('quickview-modal-root')?.classList.add('active');
    },

    closeQuickView() {
      document.getElementById('quickview-modal-root')?.classList.remove('active');
    },

    // Search Modal
    openSearchModal() {
      document.getElementById('search-modal-root')?.classList.add('active');
      setTimeout(() => document.getElementById('search-modal-input')?.focus(), 100);
    },

    closeSearchModal() {
      document.getElementById('search-modal-root')?.classList.remove('active');
    },

    handleSearchInput(query) {
      const q = (query || '').toLowerCase().trim();
      const resultsEl = document.getElementById('search-modal-results');
      if (!resultsEl) return;

      if (!q) {
        resultsEl.innerHTML = `
          <div style="padding:20px; text-align:center; color:var(--text-muted); font-size:13px;">
            Type jewelry name, stone (e.g. "Emerald", "Chandelier", "Ring", "Danglers")...
          </div>
        `;
        return;
      }

      const matches = this.products.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );

      if (matches.length === 0) {
        resultsEl.innerHTML = `<p style="padding:20px; text-align:center; color:var(--text-muted);">No pieces matching "${query}".</p>`;
        return;
      }

      resultsEl.innerHTML = matches.slice(0, 6).map(p => `
        <a href="product.html?id=${p.id}" class="cart-item-row" style="text-decoration:none; padding:12px; border-radius:4px; transition:background 0.2s;" onmouseover="this.style.background='var(--bg-subtle)'" onmouseout="this.style.background='transparent'">
          <div class="cart-item-thumb" style="width:50px; height:65px;">
            <img src="${p.image}" alt="${p.name}">
          </div>
          <div>
            <h5 style="font-family:var(--font-heading); font-size:15px; margin-bottom:2px; color:var(--text-primary);">${p.name}</h5>
            <span style="font-size:10px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px;">${p.category}</span>
            <div style="font-size:13px; font-weight:700; color:var(--rose-primary); margin-top:2px;">${this.formatMoney(p.price)}</div>
          </div>
        </a>
      `).join('');
    },

    // Global Toast Notification
    showToast(message, type = 'normal') {
      let container = document.getElementById('global-toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'global-toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = `toast-message ${type}`;
      toast.innerHTML = `
        <span style="color:var(--gold-primary);">✧</span>
        <span>${message}</span>
      `;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 400);
      }, 3000);
    },

    // Inject Common HTML (Drawers, Modals)
    injectGlobalDrawers() {
      if (document.getElementById('cart-drawer-root')) return;

      let drawersHtml = `
        <!-- Drawer Backdrop -->
        <div id="global-drawer-backdrop" class="drawer-backdrop" onclick="MaezyApp.closeAllDrawers()"></div>

        <!-- Cart Slide-Over Drawer -->
        <aside id="cart-drawer-root" class="cart-drawer">
          <div class="cart-drawer-header">
            <h3>Your Shopping Bag</h3>
            <button class="cart-close-btn" onclick="MaezyApp.closeCart()" aria-label="Close Bag">✕</button>
          </div>
          <div class="free-shipping-progress">
            <div class="progress-text" id="shipping-progress-text">
              <span>Complimentary Insured Shipping above ₹3,500</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" id="shipping-progress-fill"></div>
            </div>
          </div>
          <div class="cart-drawer-items" id="cart-items-list"></div>
          <div class="cart-drawer-footer" id="cart-footer-content"></div>
        </aside>

        <!-- Wishlist Slide-Over Drawer -->
        <aside id="wishlist-drawer-root" class="cart-drawer">
          <div class="cart-drawer-header">
            <h3>Saved Creations ♥</h3>
            <button class="cart-close-btn" onclick="MaezyApp.closeWishlist()" aria-label="Close Wishlist">✕</button>
          </div>
          <div class="cart-drawer-items" id="wishlist-items-list"></div>
        </aside>

        <!-- Quick View Lightbox Modal -->
        <div id="quickview-modal-root" class="quickview-modal-backdrop" onclick="if(event.target===this)MaezyApp.closeQuickView()">
          <div class="quickview-card">
            <button class="quickview-close-btn" onclick="MaezyApp.closeQuickView()" aria-label="Close Quick View">✕</button>
            <div id="quickview-card-content"></div>
          </div>
        </div>

        <!-- Search Overlay Modal -->
        <div id="search-modal-root" class="quickview-modal-backdrop" onclick="if(event.target===this)MaezyApp.closeSearchModal()">
          <div class="quickview-card" style="max-width:650px; padding:35px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
              <h3 style="font-family:var(--font-heading); font-size:24px;">Search The Collection</h3>
              <button class="cart-close-btn" onclick="MaezyApp.closeSearchModal()">✕</button>
            </div>
            <div style="position:relative; margin-bottom:20px;">
              <input type="search" id="search-modal-input" placeholder="Search earrings, necklaces, rings..." style="width:100%; padding:14px 20px; font-size:15px; border:1px solid var(--border-color); border-radius:var(--radius-sm); background:var(--bg-primary);" oninput="MaezyApp.handleSearchInput(this.value)">
            </div>
            <div id="search-modal-results" style="max-height:360px; overflow-y:auto; display:flex; flex-direction:column; gap:8px;"></div>
          </div>
        </div>
      `;

      // Mobile Menu Drawer (if not present)
      if (!document.getElementById('mobile-nav-drawer')) {
        drawersHtml += `
          <aside id="mobile-nav-drawer">
            <div class="cart-drawer-header">
              <img src="assets/maezy-logo.png" alt="Maezy Jewels" style="height:26px;">
              <button class="cart-close-btn" onclick="MaezyApp.closeAllDrawers()" aria-label="Close menu">✕</button>
            </div>
            <div style="padding:24px 20px; display:flex; flex-direction:column; gap:16px; overflow-y:auto; flex:1;">
              <div style="margin-bottom:6px;">
                <label style="display:block; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px; font-weight:700;">Select Currency</label>
                <select class="currency-select" style="width:100%; padding:10px 14px; border-radius:var(--radius-sm);" aria-label="Select Currency">
                  <option value="INR">INR (₹) — India</option>
                  <option value="USD">USD ($) — United States</option>
                  <option value="EUR">EUR (€) — Europe</option>
                  <option value="GBP">GBP (£) — United Kingdom</option>
                  <option value="AED">AED (AED) — UAE</option>
                </select>
              </div>
              <hr style="border:none; border-top:1px solid var(--border-color); margin:4px 0;">
              <a href="collection.html" class="nav-link" style="font-size:15px; font-weight:600;">The Complete Collection (36 Pieces)</a>
              <a href="collection.html?cat=Earrings" class="nav-link" style="font-size:14px; color:var(--text-secondary);">Earrings & Danglers (20)</a>
              <a href="collection.html?cat=Necklace sets" class="nav-link" style="font-size:14px; color:var(--text-secondary);">Couture Necklace Sets (7)</a>
              <a href="collection.html?cat=Bracelets" class="nav-link" style="font-size:14px; color:var(--text-secondary);">Tennis & Cuff Bracelets (7)</a>
              <a href="collection.html?cat=Rings" class="nav-link" style="font-size:14px; color:var(--text-secondary);">Sculptural Rings (2)</a>
              <a href="about.html" class="nav-link" style="font-size:15px; font-weight:600; margin-top:8px;">Our World & The Founders</a>
              <a href="https://www.instagram.com/maezyjewels/" target="_blank" rel="noopener" class="nav-link" style="font-size:14px; color:var(--rose-primary); font-weight:600;">
                ✧ Instagram Concierge @maezyjewels ↗
              </a>
              <hr style="border:none; border-top:1px solid var(--border-color); margin:8px 0;">
              <a href="checkout.html" class="btn btn-primary btn-full" style="text-align:center;">EXPRESS CHECKOUT 🔒</a>
            </div>
          </aside>
        `;
      }

      const div = document.createElement('div');
      div.innerHTML = drawersHtml;
      document.body.appendChild(div);
    },

    // Bind Global Interactive Events
    bindGlobalEvents() {
      // Header scroll shadow
      window.addEventListener('scroll', () => {
        const header = document.querySelector('.site-header');
        if (header) {
          if (window.scrollY > 30) {
            header.classList.add('scrolled');
          } else {
            header.classList.remove('scrolled');
          }
        }
      });

      // Currency Selectors
      document.querySelectorAll('.currency-select').forEach(select => {
        select.value = this.currency;
        select.addEventListener('change', e => {
          this.setCurrency(e.target.value);
        });
      });

      // Mobile Menu Trigger
      document.querySelectorAll('[data-action="open-mobile-menu"], #mobile-menu-trigger').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('mobile-nav-drawer')?.classList.add('active');
          document.getElementById('global-drawer-backdrop')?.classList.add('active');
        });
      });

      document.querySelectorAll('[data-action="close-mobile-menu"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          document.getElementById('mobile-nav-drawer')?.classList.remove('active');
          document.getElementById('global-drawer-backdrop')?.classList.remove('active');
        });
      });

      // Bag Buttons
      document.querySelectorAll('[data-action="open-bag"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openCart();
        });
      });

      // Wishlist Buttons
      document.querySelectorAll('[data-action="open-wishlist"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openWishlist();
        });
      });

      // Search Triggers
      document.querySelectorAll('[data-action="open-search"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.openSearchModal();
        });
      });

      // Escape key closes drawers
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.closeAllDrawers();
      });
    }
  };

  // Auto initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.MaezyApp.init());
  } else {
    window.MaezyApp.init();
  }

})();
