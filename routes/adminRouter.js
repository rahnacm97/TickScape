const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const productController = require('../controllers/admin/productController');

const {userAuth,adminAuth} = require('../middlewares/auth');

const storage = multer.diskStorage({ 
    destination: function (req, file, cb) { 
        cb(null, 'public/uploads/product-images/'); 
    }, 
    filename: function (req, file, cb) { 
        cb(null, Date.now() + path.extname(file.originalname)); 
    } 
}); 
    const uploads = multer({ storage: storage });

router.get('/pageerror',adminController.pageerror);
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
router.post('/editCategory/:id',adminAuth,categoryController.editCategory);
router.get('/admin/searchCategory',adminAuth,categoryController.searchCategory);
//Product management
router.get('/products',adminAuth,productController.getAllProducts);
router.get('/addProducts',adminAuth,productController.getProductAddPage);
router.post('/addProducts',adminAuth,uploads.array("images",4),productController.addProducts);

router.get('/logout',adminController.logout);

module.exports = router;