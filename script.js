
const { createApp, ref, computed, onMounted, reactive } = Vue;

createApp({
setup() {
    // ===== State Management =====
    const loading = ref(true);
    const loadingHistory = ref(false);
    const products = ref([]);
    const deliveryRules = ref([]);
    const orderHistory = ref([]);
    
    const searchQuery = ref("");
    const selectedCategory = ref("All");
    const currentPage = ref("shop"); // 'shop' หรือ 'history'
    
    const cart = ref([]);
    const showCartModal = ref(false);
    const selectedShippingMethod = ref(null);
    
    const showProductModal = ref(false);
    const activeProductGroup = ref(null);

    const showCheckoutForm = ref(false);
    const isSubmitting = ref(false);
    const uploadedFileName = ref("");
    
    const form = reactive({
    name: '',
    phone: '',
    address: '',
    slipFile: null
    });

    const userProfile = ref({ 
    userId: 'Guest', 
    displayName: '', 
    pictureUrl: '' 
    });

    // ===== LIFF Initialization =====
    // script.html
    const initLiff = async () => {
        try {
            console.log("Initializing LIFF...");
            // ใส่ LIFF ID ของคุณ
            const myLiffId = "2008552014-V0LN58zY"; 
            
            await liff.init({ liffId: myLiffId });

            // เช็คว่า Login หรือยัง
            if (!liff.isLoggedIn()) {
                // ถ้าอยู่ใน LINE App ให้ Login อัตโนมัติด้วย option redirectUri
                if (liff.isInClient()) {
                    // การใส่ redirectUri จะช่วยให้มันเด้งกลับมาถูกที่และหลุดจาก iframe loop
                    liff.login({ redirectUri: "https://liff.line.me/" + myLiffId });
                } else {
                    // ถ้าเปิดใน Chrome/Safari ข้างนอก รอให้ผู้ใช้กดปุ่ม Login เองดีกว่า (เพื่อไม่ให้ Loop)
                    console.log("LIFF Not logged in (External Browser). Waiting for user action.");
                }
            } else {
                // Login สำเร็จแล้ว ดึงข้อมูล
                const profile = await liff.getProfile();
                userProfile.value = profile;
                console.log("LIFF Logged in. UserID:", profile.userId);

                // Auto-fill form name
                if (profile.displayName && !form.name) {
                    form.name = profile.displayName;
                }
            }
        } catch (err) {
            console.error('LIFF Init Error:', err);
            // ไม่ควร Alert พร่ำเพรื่อเพราะอาจจะทำให้ User รำคาญถ้าเป็นแค่ Network ช้า
        }
    };

    // ===== Lifecycle Hook =====
    onMounted(() => {
    initLiff();
    
    google.script.run
        .withSuccessHandler((data) => {
        products.value = data.products;
        deliveryRules.value = data.deliveryRules;
        loading.value = false;
        })
        .withFailureHandler((err) => {
        console.error("Error loading data:", err);
        alert("เกิดข้อผิดพลาดในการโหลดข้อมูล");
        loading.value = false;
        })
        .getInitialData();
    });

    // ===== Computed Properties =====
    const uniqueCategories = computed(() => {
    const cats = products.value.map(p => p.category);
    return [...new Set(cats)];
    });

    const filteredProductGroups = computed(() => {
    let filtered = products.value.filter(p => {
        const matchCat = selectedCategory.value === 'All' || p.category === selectedCategory.value;
        const matchSearch = p.name.toLowerCase().includes(searchQuery.value.toLowerCase());
        return matchCat && matchSearch;
    });

    const groups = {};
    filtered.forEach(p => {
        if (!groups[p.name]) {
        groups[p.name] = {
            name: p.name,
            image: p.image,
            variants: [],
            minPrice: p.price
        };
        }
        groups[p.name].variants.push(p);
        if (p.price < groups[p.name].minPrice) {
        groups[p.name].minPrice = p.price;
        }
    });
    
    return Object.values(groups);
    });

    const cartTotalAmount = computed(() => {
    return cart.value.reduce((sum, item) => sum + (item.price * item.qty), 0);
    });
    
    const cartTotalItems = computed(() => {
    return cart.value.reduce((sum, item) => sum + item.qty, 0);
    });

    const availableDeliveryMethods = computed(() => {
    const total = cartTotalAmount.value;
    const methods = [];
    const seenMethods = new Set();
    
    deliveryRules.value.forEach(rule => {
        if (total >= rule.min && total <= rule.max) {
        if(!seenMethods.has(rule.method)){
            methods.push(rule);
            seenMethods.add(rule.method);
        }
        }
    });
    
    return methods;
    });

    const calculateShipping = (methodName) => {
    const rule = deliveryRules.value.find(r => 
        r.method === methodName && 
        cartTotalAmount.value >= r.min && 
        cartTotalAmount.value <= r.max
    );
    return rule ? rule.cost : 0;
    };

    const shippingCost = computed(() => {
    if (!selectedShippingMethod.value) return 0;
    return calculateShipping(selectedShippingMethod.value);
    });

    const finalTotal = computed(() => {
    return cartTotalAmount.value + shippingCost.value;
    });
    
    const isTransferMethod = computed(() => {
    return selectedShippingMethod.value && selectedShippingMethod.value.includes("โอน");
    });

    // ===== Product Modal Methods =====
    const openProductModal = (group) => { 
    activeProductGroup.value = group; 
    showProductModal.value = true; 
    };
    
    const closeProductModal = () => { 
    showProductModal.value = false; 
    activeProductGroup.value = null; 
    };

    // ===== Cart Methods =====
    const getCartQty = (product) => { 
    const item = cart.value.find(c => c.code === product.code); 
    return item ? item.qty : 0; 
    };
    
    const addToCart = (product) => {
    const item = cart.value.find(c => c.code === product.code);
    if (item) {
        item.qty++;
    } else {
        cart.value.push({ ...product, qty: 1 });
    }
    };

    const removeFromCart = (product) => {
    const index = cart.value.findIndex(c => c.code === product.code);
    if (index !== -1) {
        if (cart.value[index].qty > 1) {
        cart.value[index].qty--;
        } else {
        cart.value.splice(index, 1);
        }
    }
    
    if (cart.value.length === 0) {
        selectedShippingMethod.value = null;
    }
    };

    const toggleCart = () => { 
    showCartModal.value = !showCartModal.value; 
    };
    
    const resetCart = () => {
    if(confirm("ต้องการล้างตะกร้าสินค้า?")) { 
        cart.value = []; 
        selectedShippingMethod.value = null; 
    }
    };

    // ===== Checkout Methods =====
    const goToCheckoutForm = async () => {
    showCartModal.value = false;
    showCheckoutForm.value = true;
    
    // พยายามดึง Profile อีกรอบเผื่อตอนแรกไม่มา
    try {
        if (liff.isLoggedIn()) {
        const profile = await liff.getProfile();
        userProfile.value = profile;
        
        // Auto-fill form
        if(profile.displayName && !form.name) {
            form.name = profile.displayName;
        }
        }
    } catch(e) {
        console.log("Cannot get profile:", e);
    }
    };

    const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
        uploadedFileName.value = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
        form.slipFile = {
            data: e.target.result.split(',')[1],
            mimeType: file.type,
            name: file.name
        };
        };
        reader.readAsDataURL(file);
    }
    };

    const submitOrder = async () => {
    // เช็คอีกรอบก่อนส่ง ถ้ายัง Guest ให้ Login
    if (userProfile.value.userId === 'Guest') {
        try {
        if (!liff.isLoggedIn()) {
            // แก้ไข: ระบุ Redirect URI ไปที่ LIFF URL เพื่อให้มันกลับมาเปิด App ใหม่แบบ Clean
            liff.login({ redirectUri: "https://liff.line.me/2008552014-V0LN58zY" });
            return;
        } else {
            // ถ้า liff บอกว่า Login แล้วแต่ userProfile ยังเป็น Guest ให้ดึงใหม่
            const profile = await liff.getProfile();
            userProfile.value = profile;
        }
        } catch(e) {
        console.log("Cannot get profile", e);
        alert("กรุณาเข้าสู่ระบบผ่าน LINE (ลองกดรีเฟรชหน้าจอ)");
        return;
        }
    }

    // ตรวจสอบสลิป (ถ้าเป็นวิธีโอนเงิน)
    if (isTransferMethod.value && !form.slipFile) {
        alert("กรุณาอัพโหลดสลิปการโอนเงิน");
        return;
    }
    
    if (!confirm("ยืนยันการสั่งซื้อ?")) return;

    isSubmitting.value = true;

    const orderId = 'ORD-' + Date.now();
    const itemsText = cart.value.map(i => `${i.name} (${i.weight}) x${i.qty}`).join(", ");

    const orderData = {
        orderId: orderId,
        userId: userProfile.value.userId, 
        name: form.name,
        phone: form.phone,
        address: form.address,
        items: cart.value,
        itemsText: itemsText,
        shippingMethod: selectedShippingMethod.value,
        shippingCost: shippingCost.value,
        totalAmount: finalTotal.value,
        slipFile: form.slipFile
    };

    google.script.run
        .withSuccessHandler((res) => {
        isSubmitting.value = false;
        alert("สั่งซื้อสำเร็จ! หมายเลขคำสั่งซื้อ: " + res.orderId);
        
        // Reset form and cart
        cart.value = [];
        selectedShippingMethod.value = null;
        form.name = '';
        form.phone = '';
        form.address = '';
        form.slipFile = null;
        uploadedFileName.value = '';
        showCheckoutForm.value = false;
        
        // Close LIFF window
        if (liff.isInClient()) {
            liff.closeWindow();
        }
        })
        .withFailureHandler((err) => {
        isSubmitting.value = false;
        alert("เกิดข้อผิดพลาด: " + err);
        })
        .submitOrder(orderData);
    };

    // ===== Order History Methods =====
    const showHistoryPage = async () => {
    currentPage.value = 'history';
    loadingHistory.value = true;

    // ตรวจสอบ Login ก่อน
    if (userProfile.value.userId === 'Guest') {
        try {
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            userProfile.value = profile;
        } else {
            // alert("กรุณาเข้าสู่ระบบผ่าน LINE เพื่อดูประวัติ"); // เอา alert ออก หรือแจ้งเตือนเบาๆ
            liff.login({ redirectUri: "https://liff.line.me/2008552014-V0LN58zY" });
            return;
        }
        } catch(e) {
        console.log("Cannot get profile:", e);
        alert("กรุณาเข้าสู่ระบบผ่าน LINE");
        loadingHistory.value = false;
        currentPage.value = 'shop';
        return;
        }
    }

    // ดึงประวัติ
    google.script.run
        .withSuccessHandler((data) => {
        orderHistory.value = data;
        loadingHistory.value = false;
        })
        .withFailureHandler((err) => {
        console.error("Error loading history:", err);
        alert("เกิดข้อผิดพลาดในการโหลดประวัติ");
        loadingHistory.value = false;
        })
        .getOrderHistory(userProfile.value.userId);
    };

    const getStatusText = (status) => {
    const statusMap = {
        'Pending': 'รอดำเนินการ',
        'Shipping': 'กำลังจัดส่ง',
        'Success': 'สำเร็จ'
    };
    return statusMap[status] || status;
    };

    // ===== Return Public API =====
    return {
    // State
    loading,
    loadingHistory,
    products,
    searchQuery,
    selectedCategory,
    uniqueCategories,
    currentPage,
    orderHistory,
    
    // Product
    filteredProductGroups,
    showProductModal,
    activeProductGroup,
    openProductModal,
    closeProductModal,
    
    // Cart
    cart,
    addToCart,
    removeFromCart,
    getCartQty,
    cartTotalItems,
    cartTotalAmount,
    toggleCart,
    showCartModal,
    resetCart,
    
    // Delivery
    deliveryRules,
    availableDeliveryMethods,
    selectedShippingMethod,
    calculateShipping,
    shippingCost,
    finalTotal,
    
    // Checkout
    showCheckoutForm,
    goToCheckoutForm,
    form,
    handleFileUpload,
    submitOrder,
    isSubmitting,
    isTransferMethod,
    uploadedFileName,
    
    // History
    showHistoryPage,
    getStatusText
    };
}
}).mount('#app');