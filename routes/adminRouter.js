const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');
const orderController = require("../controllers/admin/orderController");
const bannerController = require('../controllers/admin/bannerController');
const brandController = require('../controllers/admin/brandController');
const couponController = require('../controllers/admin/couponController');

const {userAuth,adminAuth} = require('../middlewares/auth');

const storage = multer.diskStorage({ 
    destination: function (req, file, cb) { 
        cb(null, 'public/uploads/product-images/'); 
    }, 
    filename: function (req, file, cb) { 
        console.log(file,'000000');
        cb(null, Date.now() + path.extname(file.originalname)); 
    } 
}); 
const uploads = multer({ storage: storage });


//admin 
router.get('/login',adminController.adminLoadLogin);
router.post('/login',adminController.adminLogin);
router.get('/dashboard', adminAuth,adminController.loadDashboard);

//Customer Management
router.get('/users',adminAuth,customerController.customerInfo);
router.get('/blockCustomer',adminAuth,customerController.customerBlocked);
router.get('/unblockCustomer',adminAuth,customerController.customerunBlocked);

//category Management
router.get('/category',adminAuth,categoryController.categoryInfo);
router.get('/addCategory',adminAuth,categoryController.getAddCategory);
router.post('/addCategory',adminAuth,categoryController.addCategory);
router.post('/addCategoryOffer',adminAuth,categoryController.addCategoryOffer);
router.post('/removeCategoryOffer',adminAuth,categoryController.removeCategoryOffer);
router.get('/listCategory',adminAuth,categoryController.getListCategory);
router.get('/unlistCategory',adminAuth,categoryController.getUnlistCategory);
router.get('/editCategory',adminAuth,categoryController.getEditCategory);
router.put('/editCategory/:id',adminAuth,categoryController.editCategory);

// Brand Management
router.get('/brands',adminAuth,brandController.getBrandsPage);
router.get('/addBrand',adminAuth,brandController.getAddBrand);
router.post('/addBrand',adminAuth,uploads.single("image"),brandController.addBrand);
router.get('/blockBrand',adminAuth,brandController.blockBrand);
router.get('/unBlockBrand',adminAuth,brandController.unBlockBrand);
router.get('/deleteBrand',adminAuth,brandController.deleteBrand);
router.get('/editBrand/',adminAuth,brandController.getEditBrand);
router.post('/editBrand/:id',adminAuth,uploads.single("brandImage"),brandController.editBrand);
router.delete('/deletebrandImage',adminAuth,brandController.deleteSingleImage);

//Product management
router.get('/products',adminAuth,productController.getAllProducts);
router.get('/addProducts',adminAuth,productController.getProductAddPage);
router.post('/addProducts',adminAuth,uploads.array("images"),productController.addProducts);
router.post('/addProductOffer',adminAuth,productController.addProductOffer);
router.post('/removeProductOffer',adminAuth,productController.removeProductOffer);
router.get('/blockProduct',adminAuth,productController.blockProduct);
router.get('/unblockProduct',adminAuth,productController.unblockProduct);
router.get('/editProduct/:id',adminAuth,productController.getEditProduct);
router.post('/editProduct/:id',adminAuth,uploads.array("images"),productController.editProduct);
router.delete('/deleteImage',adminAuth,productController.deleteSingleImage);
router.get('/deleteProduct',adminAuth,productController.deleteProduct);

// Order Management
router.get("/orderList", adminAuth, orderController.getOrderListPageAdmin)
router.get("/orderDetailsAdmin/:id", adminAuth, orderController.getOrderDetailsPageAdmin)
router.post('/update-order-status',adminAuth,orderController.updateOrderStatus);


//Banner Management
router.get('/banner',adminAuth,bannerController.getBanner);
router.get('/addBanner',adminAuth,bannerController.getAddBanner);
router.post('/addBanner',adminAuth,uploads.single("images"),bannerController.addBanner);
router.get('/deleteBanner',adminAuth,bannerController.deleteBanner);

//Coupon Management
router.get('/coupon',adminAuth,couponController.loadCoupon);
router.get('/createCoupon',adminAuth,couponController.loadCreateCoupon);
router.post('/createCoupon',adminAuth,couponController.createCoupon);
router.get('/editCoupon',adminAuth,couponController.editCoupon);
router.post('/updateCoupon',adminAuth,couponController.updateCoupon);
router.get('/deleteCoupon',adminAuth,couponController.deleteCoupon);

router.get('/logout',adminAuth,adminController.logout);

router.get('/pageerror',adminController.pageerror);

module.exports = router;