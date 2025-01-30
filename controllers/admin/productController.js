const mongoose = require('mongoose');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const User = require('../../models/userSchema');
const Brand = require('../../models/brandSchema');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');


const getProductAddPage = async(req,res) => {
    try {
        const category = await Category.find({isListed:true});
        const brand = await Brand.find({isBlocked:false});
        res.render("product-add",{
            cat: category,
            brand: brand
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
             console.log(req.files);

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    const resizedImagePath = path.join('public', 'uploads', 'product-images', 'processed', Date.now() + "-" + req.files[i].filename);
                    await sharp(originalImagePath)
                        .resize({ width: 440, height: 440 })
                        .toFile(resizedImagePath);

                    images.push('uploads/product-images/' + req.files[i].filename);  // Relative path for DB
                }
            }

            const categoryId = await Category.findOne({ name: products.category });
            if (!categoryId) {
                console.error("Invalid category name:", products.category);
                return res.status(400).json("Invalid Category Name");
            }

            const brandExists = await Brand.findOne({ brandName: products.brand });
            if (!brandExists) {
                console.error("Invalid brand name:", products.brand);
                return res.status(400).json("Invalid Brand Name");
            }

            console.log("Brand:", products.brand);

            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                brand: brandExists._id,
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

// const getAllProducts = async(req,res) => {
//     try {
//         const search = req.query.search || "";
//         const page = req.query.page || 1;
//         const limit = 4;

//         const searchQuery = req.query.search || '';
//         const searchFilter = searchQuery ? { name: { $regex: searchQuery, $options: 'i' } } : {};
        
//         const productData = await Product.find({
//             $or:[
//                 {productName:{$regex:new RegExp(".*"+search+".*","i")}},
//                   {brand:{$regex:new RegExp(".*"+search+".*","i")}},
//             ],
//         }).limit(limit*1).skip((page-1)*limit).populate('category').exec();

//         const count = await Product.find({
//             $or:[
//                 {productName:{$regex:new RegExp(".*"+search+".*","i")}},
//                   {brand:{$regex:new RegExp(".*"+search+".*","i")}},
//             ],
//         }).countDocuments();

//         const category = await Category.find({isListed:true});
//         const brand = await Brand.find({isBlocked:false});

//         if(category && brand){
//             res.render("products",{
//                 data:productData,
//                 currentPage:page,
//                 totalPages:page,
//                 totalPages:Math.ceil(count/limit),
//                 cat:category,
//                 brand: brand
//             })
//         }else{
//             res.render("/pageerror");
//         }
//     } catch (error) {
//         res.redirect("/pageerror");
//     }
// }

const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1; // Ensure `page` is an integer
        const limit = 4;

        // Create a search filter
        const searchFilter = search ? { 
        
                productName: { $regex: new RegExp(search, "i") }  
                
        } : {};

        // Fetch the products with pagination and search filter
        const productData = await Product.find(searchFilter)
            .limit(limit)
            .skip((page - 1) * limit)
            .populate("category")
            .populate("brand")
            .exec();

        // Count the total number of documents matching the filter
        const count = await Product.countDocuments(searchFilter);

        // Fetch the categories
        const category = await Category.find({ isListed: true });

        // Fetch unblocked brands
        const brand = await Brand.find({ isBlocked: false });

        if (category && brand) {
            res.render("products", {
                data: productData,
                currentPage: page,
                limit: limit, 
                totalPages: Math.ceil(count / limit),
                category: category,
                brand: brand,
                searchQuery: search, // Pass the search query to the template
            });
        } else {
            res.render("/pageerror");
        }
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/pageerror");
    }
};


// const addProductOffer = async(req,res) => {
//     try {
//         const {productId,percentage} = req.body;
//         const findProduct = await Product.findOne({_id:productId});
//         const findCategory = await Category.findOne({_id:findProduct.category});
//         if(findCategory.categoryOffer > percentage){
//             return res.json({status:false,message:"This product category already has a category offer"});
//         }
//         findProduct.salePrice = findProduct.salePrice - Math.floor(findProduct.regularPrice*(percentage/100));
//         findProduct.productOffer = parseInt(percentage);
        
//         await findProduct.save();
//         findCategory.categoryOffer = 0;
//         await findCategory.save();
//         res.json({status:true});
//     } catch (error) {
//         console.error("Error applying product offer:", error);
//         return res.status(500).json({ status: false, message: "Internal Server Error" });
//     }
// }

const addProductOffer = async (req, res) => {
    try {
        const { productId, percentage } = req.body;
        
       console.log(percentage);
        // Ensure percentage is a number
        const offerPercentage = parseFloat(percentage);
        if (isNaN(offerPercentage)) {
            return res.status(400).json({ status: false, message: "Invalid input: percentage must be a number." });
        }

        const findProduct = await Product.findOne({ _id: productId });
        const findCategory = await Category.findOne({ _id: findProduct.category });

        if (findCategory.categoryOffer > offerPercentage) {
            return res.json({ status: false, message: "This product category already has a higher category offer." });
        }

        findProduct.salePrice = findProduct.salePrice - Math.floor(findProduct.regularPrice * (offerPercentage / 100));
        findProduct.productOffer = offerPercentage;

        await findProduct.save();

        // Reset the category offer
        findCategory.categoryOffer = 0;
        await findCategory.save();

        res.json({ status: true });
    } catch (error) {
        console.error("Error applying product offer:", error);
        return res.status(500).json({ status: false, message: "Internal Server Error" });
    }
};


const removeProductOffer = async(req,res) => {
    try {
        const {productId} = req.body;
        const findProduct = await Product.findOne({_id:productId});
        const percentage = findProduct.productOffer;
        findProduct.salePrice = findProduct.salePrice + Math.floor(findProduct.regularPrice*(percentage/100));
        findProduct.productOffer = 0;
        await findProduct.save();
        res.json({status:true});

    } catch (error) {
        res.redirect("/pageerror");
    }
}

const blockProduct = async (req, res) => {
    try {
        let id = req.query.id.trim();
        console.log("Blocking product ID:", id);
        await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
        console.log("Blocked product successfully");
        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error blocking product:", error);
        res.redirect("/pageerror");
    }
};

const unblockProduct = async (req, res) => {
    try {
        let id = req.query.id.trim();
        console.log("Unblocking product ID:", id);
        await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
        console.log("Unblocked product successfully");
        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.redirect("/pageerror");
    }
};

const getEditProduct = async (req,res) => {
    try {
        const id = req.params.id.trim();
        //console.log("The id is",id);
        const product = await Product.findOne({_id:id});
        //console.log(product);
        const category = await Category.find({});
        //console.log(category);/
        const brand = await Brand.find({});
        console.log(product,'0000');
        
        res.render('edit-product',{
            product:product,
            category:category,
            brand:brand
        });
        console.log("Exited")
    } catch (error) {
        res.redirect("/pageerror");
    }
}

// const editProduct = async(req,res)=>{
//     try {
//         const id = req.params.id;
//         const product = await Product.findOne({_id:id});
//         const data = req.body;
//         const existingProduct = await Product.findOne({
//             productName:data.productName,
//             id:{$ne:id}
//         })
//         if(existingProduct){
//             return res.status(400).json({error:"Product with this name already exists.Please try with another name"});

//         }
//         const images = [];
//         if(req.files && req.files.length>0){
//             for(let i=0;i<req.files.length;i++){
//                 images.push(req.files[i].filename);
//             }
//         }

//         const updateFields = {
//             productName:data.productName,
//             description:data.description,
//             category:product.category,
//             regularPrice:data.regularPrice,
//             salePrice:data.salePrice,
//             quantity:data.quantity,
//             size:data.size,
//             color:data.color
//         }
//         if(req.files.length>0){
//             updateFields.$push = {productImage:{$each:images}};
//         }

//         await Product.findByIdAndUpdate(id,updateFields,{new:true});
//         res.redirect("/admin/products");
//     } catch (error) {
//         console.error(error);
//         res.redirect("/pageerror");
//     }
// }

const editProduct = async (req, res) => {

    try {
       
        const id = req.params.id.trim();

        // console.log(req.params)

        if (!id) {
            return res.status(400).send("Invalid product ID");
        }

        // console.log("Product ID:", id);

        const product = await Product.findOne({ _id: id })
        if (!product) {
            return res.status(404).send("Product not found");
        }
        console.log(product);
        // const category = await Category.find({ isListed: true });
        // const brand = await Brand.find({ isBlocked: false });
        const data = req.body;

        const brandObj = await Brand.findById(data.brand);
        if (!brandObj) {
            return res.status(400).send("Brand not found");
        }
        // console.log("Request data:", data);

        const existingProduct = await Product.findOne({
            productName: data.productName,
            _id: { $ne: id },
        });

        if (existingProduct) {
            return res.status(400).json({
                error: "Product with this name already exists. Please try with another name.",
            });
        }
      
        const images = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => images.push(`uploads/product-images/${file.filename}`));
        }
        // console.log("Category is",data.caBrandtegory);

        const updateFields = {
            productName: data.productName,
            description: data.description,
            brand: data.brand,
            category: data.category,
            regularPrice: data.regularPrice,
            salePrice: data.salePrice,
            quantity: data.quantity,
            size: data.size,
            color: data.color,
        };

        if (images.length > 0) {
            updateFields.$push = { productImage: { $each: images } };
        }
        // console.log("id is ",id);
        await Product.findByIdAndUpdate(id, updateFields, { new: true });

        res.redirect("/admin/products");
    } catch (error) {
        console.error("Error in editProduct:", error);
        res.redirect("/pageerror");
    }
};

// const deleteSingleImage = async(req,res) => {
//     try {
//         const {imageNameToServer,productIdToServer} = req.body;
//         const product = await Product.findByIdAndUpdate(productIdToServer,{$pull:{productImage:imageNameToServer}});
//         const imagePath = path.join("public","uploads","product-images","processed",imageNameToServer);
//         if(fs.existsSync(imagePath)){
//             await fs.unlinkSync(imagePath);
//             console.log(`Image ${imageNameToServer} deleted successfully.`);
//         }else{
//             console.log(`Image ${imageNameToServer} not found.`);
//         }
//         res.send({status:true});
//     } catch (error) {
//         res.redirect("/pageerror");
//     }
// }

const deleteSingleImage = async (req, res) => {
    try {
        console.log('halooo');
        
        const { imageNameToServer, productIdToServer } = req.body;
        console.log('productId:', productIdToServer);
        console.log('imageName:', imageNameToServer);
        
        // Update database
        const product = await Product.findByIdAndUpdate(
            productIdToServer,
            { $pull: { productImage: imageNameToServer } }
        );
        
        // Check if image exists on server
        const imagePath = path.join("public", imageNameToServer);
        console.log('Image path:', imagePath);
        
        if (fs.existsSync(imagePath)) {
            await fs.unlinkSync(imagePath);
            console.log(`Image ${imageNameToServer} deleted successfully.`);
        } else {
            console.log(`Image ${imageNameToServer} not found.`);
        }

        res.send({ status: true });
    } catch (error) {
        console.error('Error deleting image:', error);
        res.redirect("/pageerror");
    }
}

console.log("Exited");

const deleteProduct = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || !mongoose.Types.ObjectId.isValid(id.trim())) {
            return res.status(400).redirect('/pageerror'); 
        }
        await Product.deleteOne({ _id: id.trim() });
        res.redirect('/admin/products');
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).redirect('/pageerror');
    }
};


module.exports = {
    getProductAddPage,
    addProducts,
    getAllProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage,
    deleteProduct,
}