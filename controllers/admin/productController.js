const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');


const getProductAddPage = async(req,res) => {
    try {
        const category = await Category.find({isListed:true});
        res.render("product-add",{
            cat:category
        });
    } catch (error) {
        res.redirect("/pageerror");
    }
}

const addProducts = async (req, res) => {
    try {
        const products = req.body;
        console.log("Received product data:", products);

        const productExists = await Product.findOne({
            productName: products.productName,
        });
        if (!productExists) {
            const images = [];

            const processedDir = path.join('public', 'uploads', 'product-images', 'processed');
            if (!fs.existsSync(processedDir)) {
                fs.mkdirSync(processedDir, { recursive: true });
            }

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    const resizedImagePath = path.join('public', 'uploads', 'product-images', 'processed', Date.now() + "-" + req.files[i].filename);
                    await sharp(originalImagePath)
                        .resize({ width: 440, height: 440 })
                        .toFile(resizedImagePath);

                    images.push('processed/' + Date.now() + "-" + req.files[i].filename);  // Relative path for DB
                }
            }

            const categoryId = await Category.findOne({ name: products.category });
            if (!categoryId) {
                console.error("Invalid category name:", products.category);
                return res.status(400).json("Invalid Category Name");
            }

            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                category: categoryId._id,
                regularPrice: products.regularPrice,
                salePrice: products.salePrice,
                createdOn: new Date(),
                quantity: products.quantity,
                size: products.size,
                color: products.color,
                productImage: images,  
                status: 'Available',
            });

            await newProduct.save();
            return res.redirect('/admin/addProducts');
        } else {
            console.error("Product already exists:", products.productName);
            return res.status(400).json("Product already exists, please try with another name");
        }
    } catch (error) {
        console.error("Error saving product:", error);
        return res.status(500).json({ message: "Error saving product: " + error.message });
    }
};

const getAllProducts = async(req,res) => {
    try {
        const search = req.query.search || "";
        const page = req.query.page || 1;
        const limit = 4;
        
        const productData = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
            ],
        }).limit(limit*1).skip((page-1)*limit).populate('category').exec();

        const count = await Product.find({
            $or:[
                {productName:{$regex:new RegExp(".*"+search+".*","i")}},
            ],
        }).countDocuments();

        const category = await Category.find({isListed:true});

        if(category){
            res.render("products",{
                data:productData,
                currentPage:page,
                totalPages:page,
                totalPages:Math.ceil(count/limit),
                cat:category,
            })
        }else{
            res.render("page-404");
        }
    } catch (error) {
        res.redirect("/pageerror");
    }
}

module.exports = {
    getProductAddPage,
    addProducts,
    getAllProducts,

}