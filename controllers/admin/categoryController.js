const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');

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
        //const { name, description } = req.body;
        //const existingCategory = await Category.findOne({name:name});
        res.render('add-category');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const addCategory = async (req,res) => {
    try {
        const { name, description } = req.body;
        const existingCategory = await Category.findOne({name:name});
        if(existingCategory){
            return res.status(400).json({error:"Category already exists"});
        }
        const newCategory = new Category({
            name,
            description,
        })
        await newCategory.save();
        return res.json({message:"Category added successfully"})
    } catch (error) {
        console.error(error);
        return res.status(500).json({error:"Internal Server Error"})
    }
}

const addCategoryOffer = async(req,res) => {
    try {
        const percentage = parseInt(req.body.percentage);
        const categoryId = req.body.categoryId;
        const category = await Category.findById(categoryId);
        if(!category){
            return res.status(404).json({status:false, message:"Category Not Found"});
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
        res.status(500).json({status:false, message:"Internal Server Error"})
    }
};

const removeCategoryOffer = async (req,res) => {
    try {
       const categoryId = req.body.categoryId;
       const category = await Category.findById(categoryId);
       
       if(!category){
        return res.status(404).json({status:false , message:"Category Not Found"});
       }

       const percentage = category.categoryOffer;
       const products = await Product.find({category:category._id});

       if(products.length > 0){
        for(const product of products){
            product.salePrice += Math.floor(product.regularPrice * (percentage/100));
            product.productOffer = 0;
            await product.save();
        }
       }
       category.categoryOffer = 0;
       await category.save();
       res.json({status:true});
    } catch (error) {
        res.status(500).json({status:false, message:"Internal Server Error"});
    }
}

const getListCategory = async(req,res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:false}});
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const getUnlistCategory = async(req,res) => {
    try {
        let id = req.query.id;
        await Category.updateOne({_id:id},{$set:{isListed:true}});
        res.redirect('/admin/category');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const getEditCategory = async (req,res) => {
    try {
        const id = req.query.id;
        const category = await Category.findOne({_id:id});
        res.render('edit-category',{category:category});
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const editCategory = async(req,res) => {
    try {
        const id = req.params.id;
        const {categoryName,description} = req.body;
        const existingCategory = await Category.findOne({name:categoryName});
        
        if(existingCategory){
            return res.status(400).json({error:"Category exists, Choose another name"});
        }

        const updateCategory = await Category.findByIdAndUpdate(id,{
            name:categoryName,
            description:description
        },{new:true});

        if(updateCategory){
            res.redirect('/admin/category');
        }else{
            res.status(404).json({error:"Category Not Found"});
        }
    } catch (error) {
        res.status(500).json({error:"Internal Server Error"});
    }
}

const searchCategory = async (req, res) => {
    try {
      const searchQuery = req.query.search || ''; 
      const currentPage = parseInt(req.query.page) || 1; 
      const itemsPerPage = 4; 
      const skip = (currentPage - 1) * itemsPerPage; 
  
      const categories = await Category.find({
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { description: { $regex: searchQuery, $options: 'i' } }
        ]
      })
      .skip(skip)
      .limit(itemsPerPage);
  
      const totalCategories = await Category.countDocuments({
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { description: { $regex: searchQuery, $options: 'i' } }
        ]
      });
  
      const totalPages = Math.ceil(totalCategories / itemsPerPage); 
  
      res.render('admin/category', {
        cat: categories,
        searchQuery,
        currentPage,
        totalPages
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Error fetching categories');
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
    searchCategory
}