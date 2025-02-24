const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const CustomError = require('../../utils/customError');

const categoryInfo = async (req,res) => {
    try{
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;

        const searchQuery = req.query.search || '';
        const searchFilter = searchQuery ? { name: { $regex: searchQuery, $options: 'i' } } : {};
        const categoryData = await Category.find(searchFilter)
        .sort({createdAt:-1})
        .skip(skip)
        .limit(limit);

        const totalCategories = await Category.countDocuments(searchFilter);
        const totalPages = Math.ceil(totalCategories / limit);
        res.render("category",{
            cat:categoryData,
            currentPage:page,
            limit:limit,
            totalPages:totalPages,
            totalCategories:totalCategories,
            searchQuery: searchQuery
        }); 
    }catch(error){
        console.error(error);
        res.redirect('/pageerror');
    }
}

const getAddCategory = async (req,res) => {
    try {
        
        res.render('add-category');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const addCategory = async (req, res,next) => {
    try {
        const { name, description } = req.body;
        const trimmedName = name.trim().toUpperCase();
        
        const existingCategory = await Category.findOne({ name: trimmedName });
        if (existingCategory) {
            next(new CustomError(400, "Category already exists"))
        }

        const newCategory = new Category({
            name: trimmedName,  
            description: description.trim(), 
        });

        await newCategory.save();

        return res.json({ message: "Category added successfully" });
    } catch (err) {
        next(new CustomError(err.statusCode, err.message))
    }
};


const addCategoryOffer = async(req,res,next) => {
    try {
        const percentage = parseInt(req.body.percentage);
        const categoryId = req.body.categoryId;
        const category = await Category.findById(categoryId);
        if(!category){
            next(new CustomError(404, "Category Not Found"))
            //return res.status(404).json({status:false, message:"Category Not Found"});
        }
        const products = await Product.find({category:category._id});
        const hasProductOffer = products.some((product) => product.productOffer > percentage);
        if(hasProductOffer){
            return res.json({status:false, message:"Products within this category already have product offer"});
        }
        await Category.updateOne({_id:categoryId},{$set:{categoryOffer:percentage}});

        for(const product of products){
            product.productOffer = 0;
            product.salePrice = product.regularPrice;
            await product.save();
        }
        res.json({status:true});
    } catch (error) {
        next(new CustomError(500, "Internal Server Error"))
        //res.status(500).json({status:false, message:"Internal Server Error"})
    }
};

// const removeCategoryOffer = async (req,res,next) => {
//     try {
//        const categoryId = req.body.categoryId;
//        const category = await Category.findById(categoryId);
       
//        if(!category){
//         next(new CustomError(404, "Category Not Found"))
//         //return res.status(404).json({status:false , message:"Category Not Found"});
//        }

//        const percentage = category.categoryOffer;
//        const products = await Product.find({category:category._id});

//        if(products.length > 0){
//         for(const product of products){
//             product.salePrice += Math.floor(product.regularPrice * (percentage/100));
//             product.productOffer = 0;
//             await product.save();
//         }
//        }
//        category.categoryOffer = 0;
//        await category.save();
//        res.json({status:true});
//     } catch (error) {
//         next(new CustomError(500, "Internal Server Error"))
//         //res.status(500).json({status:false, message:"Internal Server Error"});
//     }
// }

const removeCategoryOffer = async (req, res, next) => {
    try {
        const { categoryId } = req.body;

        // Validate input
        if (!categoryId) {
            return res.status(400).json({ status: false, message: "Category ID is required." });
        }

        const category = await Category.findById(categoryId);

        if (!category) {
            return res.status(404).json({ status: false, message: "Category not found." });
        }

        // If no offer is active, avoid unnecessary updates
        if (category.categoryOffer === 0) {
            return res.json({ status: false, message: "No active offer to remove." });
        }

        const offerAmount = category.categoryOffer; // Fixed amount (not percentage)

        const products = await Product.find({ category: category._id });

        if (products.length > 0) {
            for (const product of products) {
                if (product.productOffer > 0) {
                    product.salePrice += product.productOffer; // Restore original price
                    product.productOffer = 0; // Reset offer
                    await product.save();
                }
            }
        }

        category.categoryOffer = 0;
        await category.save();

        res.json({ status: true, message: "Category offer removed successfully." });

    } catch (error) {
        console.error("Error removing category offer:", error);
        res.status(500).json({ status: false, message: "Internal Server Error" });
    }
};

const getListCategory = async(req,res,next) => {
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}});
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const getUnlistCategory = async(req,res,next) => {
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:true}});
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const getEditCategory = async (req,res,next) => {
    try {
        const id = req.query.id;
        const category = await Category.findOne({_id:id});
        res.render('edit-category',{category:category});
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const editCategory = async (req, res,next) => {
    try {
        const id = req.params.id;
        const { categoryName, description } = req.body;
        const existingCategory = await Category.findOne({ name: { $regex: new RegExp("^" + categoryName + "$", "i") },
        _id: { $ne: id } });

        if (existingCategory && existingCategory._id.toString() !== id) {
            next(new CustomError(400, "Category exists, choose another name"))
            //return res.status(400).json({ error: "Category exists, choose another name" });
        }

        const updateCategory = await Category.findByIdAndUpdate(
            id,
            { name: categoryName, description: description },
            { new: true }
        );

        if (updateCategory) {
            return res.json({ success: true, redirectUrl: "/admin/category" });
        } else {
            next(new CustomError(404, "Category Not Found"))
            //res.status(404).json({ error: "Category Not Found" });
        }
    } catch (error) {
        next(new CustomError(500, "Internal Server Error"))
        //res.status(500).json({ error: "Internal Server Error" });
    }
};


module.exports = {
    categoryInfo,
    getAddCategory,
    addCategory,
    addCategoryOffer,
    removeCategoryOffer,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
}