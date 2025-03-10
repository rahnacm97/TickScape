const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Banner = require('../../models/bannerSchema');
const Brand = require('../../models/brandSchema');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const pageNotFound = async(req,res) => {
    try{
        await res.status(404).render("404page", 
            { 
                message: "The page you are looking for does not exist." 
            });
        } catch (err) {
            console.error("Error rendering 404 page:", err);
            res.status(500).send("Something went wrong.");
        }
}

const loadHomePage = async(req,res) => {
    try{
        const today = new Date().toISOString();
        const findBanner = await Banner.find({
            startDate:{$lt:new Date(today)},
            endDate:{$gt:new Date(today)},
        });
        const user = req.session.user;
        const categories = await Category.find({isListed:true});
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categories.map(category=>category._id)},quantity:{$gt:0}
        })

        productData.sort((a,b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0,4);
        if(user){
            const userData = await User.findOne({_id:user._id});
            res.locals.user = userData;
            res.render("home",{user:userData,products:productData,banner:findBanner || []});
        }else{
            res.locals.user = null;
            return res.render("home",{products:productData, banner:findBanner || []});
        }
       
    }catch(err){
        console.log("Home Page Not Found");
        res.status(500).send("Server Error");
    }
}

const loadLoginPage = async(req,res) => {
    try{
        return res.render('login',{
            user: req.session.user || null
        });
    }catch(err){
        res.redirect('/pageNotFound');
    }
}

const login = async(req,res) => {
    try{
        const {email,password} = req.body;
        const findUser = await User.findOne({isAdmin: 0,email:email});
        if(!findUser){
            return res.render("login",{message:"User Not Found"});
        }
        if(findUser.isBlocked){
            return res.render("login",{message:"User is Blocked by Admin"});
        }
        const passwordMatch = await bcrypt.compare(password,findUser.password);
        if(!passwordMatch){
            return res.render("login",{message:"Incorrect Password"});
        }
        req.session.user = findUser;
        // Pass user to all views using res.locals
        res.locals.user = req.session.user;
        res.redirect('/');
    }catch(err){
        console.error("Login error",err);
        res.render("login",{message:"Login Failed. Please try again."})
    }
}


function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}

async function sentVerification(email,otp){
    try{
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth:{
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify Your Account",
            text: `Your OTP is ${otp}`,
            html:`<b>Your OTP is to verify the TickScape account is ${otp}</b>`,

        })

        return info.accepted.length > 0
    }catch(error){
        console.error("Error sending Email",error);
        return false;
    }
}

const loadSignupPage = async(req,res) => {
    try{
        await res.render("signup");
    }catch(err){
        console.log("Sign Up Page Not Found");
        res.status(500).send("Server Error");
    }
}

const signup = async(req,res) => {
    try{
        const {fname,lname,phone,email, password,cpassword} = req.body;
        if(password !== cpassword){
            return res.render('signup',{message:"Password do not match"});
        }
        const findUser = await User.findOne({email});
        if(findUser){
            return res.render('signup',{message:"Email already exists"});
        }
        console.log

        const otp = generateOtp();

        const emailSent = await sentVerification(email,otp);

        if(!emailSent){
            return res.json("email-error");
        }

        req.session.userOtp = otp;
        req.session.userData = {fname,lname,phone,email,password};

        res.render("verify-otp");
        console.log("OTP Sent ",otp);

    }catch(err){
        console.error("Signup Error",err);
        res.redirect('/pageNotFound');
    }
}

const securePassword = async (password) => {
    try{
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
    }catch(error){
        console.error("Error hashing password:", error);
        throw new Error("Password hashing failed");
    }
}

const verifyOtp = async (req,res) => {
    try{
        const {otp} = req.body;
        console.log(otp);

        if(otp === req.session.userOtp){
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);
            const saveUserData = new User({
                fname:user.fname,
                lname:user.lname,
                email:user.email,
                phone:user.phone,
                password:passwordHash,
                isAdmin:0,
            })
            await saveUserData.save();
            req.session.user = saveUserData._id;
            res.json({success:true,redirectUrl:"/login"});
        }else{
            res.status(400).json({success:false, message:"Invalid OTP, Please try again"});
        }
    }catch(error){
        console.error("error verifying OTP",error);
        res.status(500).json({success:false, message:"An error occured"});
    }
}

const resendOtp = async (req,res) =>{
    try{
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"});
        }
        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sentVerification(email,otp);
        if(emailSent){
            console.log("Resend OTP",otp);
            res.status(200).json({success:true,message:"OTP Resend Successfully"});
        }else{
            res.status(500).json({success:false,message:"Failed to resend OTP. Please try again"});
        }
    }catch(error){
        console.error("Error resending OTP",error);
        res.status(500).json({success:false,message:"Internal Server Error. Please try again"});
    }
}

const logout = async (req,res) => {
    try{
        req.session.destroy((err) => {
            if(err){
                console.log("Session destruction error",err.message);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('/login');
        })

    }catch(error){
        console.log("Logout Error",error);
        res.redirect('/pageNotFound');
    }
}

// const filterProducts = async (req, res) => {
//     try {
//         const user = req.session.user;
//         const categoryId = req.query.category;
//         const brandId = req.query.brand;
        
//         const query = {
//             isBlocked: false,
//             quantity: { $gt: 0 }, 
//         };

//         if (categoryId) {
            
//             query.category = categoryId;
//         }

//         if (brandId) {
            
//             query.brand = brandId;
//         }

//         let findProducts = await Product.find(query).lean();

//         findProducts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));

//         const categories = await Category.find({ isListed: true });
//         const brands = await Brand.find({ isBlocked: false });

//         console.log("The brand Are",brands);

//         // Pagination setup
//         const itemsPerPage = 6;
//         const currentPage = parseInt(req.query.page) || 1;
//         const startIndex = (currentPage - 1) * itemsPerPage;
//         const endIndex = startIndex + itemsPerPage;
//         const totalPages = Math.ceil(findProducts.length / itemsPerPage);

//         const currentProducts = findProducts.slice(startIndex, endIndex);

//         let userData = null;

//         if (user) {
//             userData = await User.findOne({ _id: user });
//             if (userData) {
//                 const searchEntry = {
//                     category: categoryId || null,
//                     brand: brandId || null,
//                     searchedOn: new Date(),
//                 };
//                 userData.searchHistory.push(searchEntry);
//                 await userData.save();
//             }
//         }

//         req.session.filteredProducts = currentProducts;

//         res.render("shop", {
//             user: userData,
//             products: currentProducts,
//             category: categories,
//             brand: brands,
//             totalPages,
//             currentPage,
//             selectedCategory: categoryId || null,
//             selectedBrand: brandId || null
//         });
//     } catch (error) {
//         console.error("Error in filterProducts:", error);
//         res.redirect("/pageNotFound");
//     }
// };

// const filterByPrice = async(req,res) => {
//     try {
//         const user = req.session.user;
//         const userData = await User.findOne({_id:user});
//         const brands = await Brand.find({}).lean();
//         const categories = await Category.find({isListed:true}).lean();

//         let findProducts = await Product.find({
//             salePrice: {$gt: req.query.gt, $lt:req.query.lt},
//             isBlocked: false,
//             quantity: {$gt:0}
//         }).lean();

//         findProducts.sort((a,b) => new Date(b.createdOn) - new Date(a.createdOn));

//         let itemsPerPage = 6;
//         let currentPage = parseInt(req.query.page) || 1;
//         let startIndex = (currentPage-1)*itemsPerPage;
//         let endIndex = startIndex + itemsPerPage;
//         let totalPages = Math.ceil(findProducts.length/itemsPerPage);
//         const currentProduct = findProducts.slice(startIndex,endIndex);
//         req.session.filteredProducts = currentProduct;

//         res.render('shop',{
//             user: userData,
//             products: currentProduct,
//             brand: brands,
//             category: categories,
//             totalPages,
//             currentPage
//         })

//     } catch (error) {
//         console.log("Error in filter by price",error);
//         res.redirect('/pageNotFound');
//     }
// }

// const getSortProduct = async (req, res) => {
//     try {
//         const user = req.session.user;
//         const { category, brand, gt, lt, sort, page } = req.query;

//         const filterQuery = {
//             isBlocked: false,
//             quantity: { $gt: 0 }, 
//         };

//         if (category) {
//             filterQuery.category = category;
//         }

//         if (brand) {
//             filterQuery.brand = brand;
//         }

//         if (gt && lt) {
//             filterQuery.salePrice = { $gt: gt, $lt: lt };
//         }

//         let sortOptions = {};
//         switch (sort) {
//             case 'price_asc': sortOptions = { salePrice: 1 }; break;
//             case 'price_desc': sortOptions = { salePrice: -1 }; break;
//             case 'name_asc': sortOptions = { productName: 1 }; break;
//             case 'name_desc': sortOptions = { productName: -1 }; break;
//             default: sortOptions = { createdOn: -1 };
//         }

//         // Fetch products based on filter and sort
//         let findProducts = await Product.find(filterQuery).sort(sortOptions).lean();

//         const itemsPerPage = 6;
//         const currentPage = Math.max(parseInt(page) || 1, 1);
//         const totalPages = Math.ceil(findProducts.length / itemsPerPage);
//         const validPage = Math.min(currentPage, totalPages);
//         const startIndex = (validPage - 1) * itemsPerPage;
//         const endIndex = startIndex + itemsPerPage;
//         const currentProducts = findProducts.slice(startIndex, endIndex);

//         // Fetch categories and brands
//         const categories = await Category.find({ isListed: true }).lean();
//         const brands = await Brand.find({ isBlocked: false }).lean();

//         // User-specific search history tracking
//         let userData = null;
//         if (user) {
//             userData = await User.findOne({ _id: user });
//             if (userData) {
//                 const searchEntry = {
//                     category: category || null,
//                     brand: brand || null,
//                     priceRange: { gt, lt },
//                     searchedOn: new Date(),
//                 };
//                 userData.searchHistory.push(searchEntry);
//                 await userData.save();
//             }
//         }
//         res.render('shop', {
//             user: userData,
//             products: currentProducts,
//             category: categories,
//             brand: brands,
//             totalPages,
//             currentPage: validPage,
//             selectedCategory: category || null,
//             selectedBrand: brand || null,
//             selectedPriceRange: { gt, lt },
//             sort,
//         });
//     } catch (error) {
//         console.error("Error in getSortProduct:", error);
//         res.redirect('/pageNotFound');
//     }
// };


// const sortProducts = async (req, res) => {
//     try {

//         const user = req.session.user;
//         const { sort, page, category, brand, gt, lt } = req.query;
//         const filterQuery = {
//             isBlocked: false,
//             quantity: { $gt: 0 },
//         };

//         if (category) {
//             filterQuery.category = category;
//         }
//         if (brand) {
//             filterQuery.brand = brand;
//         }
//         if (gt && lt) {
//             filterQuery.salePrice = { $gt: gt, $lt: lt };
//         }

//         let sortOptions = {};
//         switch (sort) {
//             case 'price_asc': sortOptions = { salePrice: 1 }; break;
//             case 'price_desc': sortOptions = { salePrice: -1 }; break;
//             case 'name_asc': sortOptions = { productName: 1 }; break;
//             case 'name_desc': sortOptions = { productName: -1 }; break;
//             default: sortOptions = { createdOn: -1 }; 
//         }
//         let findProducts = await Product.find(filterQuery).sort(sortOptions).lean();

//         const itemsPerPage = 6;
//         const currentPage = Math.max(parseInt(page) || 1, 1);
//         const totalPages = Math.ceil(findProducts.length / itemsPerPage);
//         const validPage = Math.min(currentPage, totalPages);
//         const startIndex = (validPage - 1) * itemsPerPage;
//         const endIndex = startIndex + itemsPerPage;
//         const currentProducts = findProducts.slice(startIndex, endIndex);

//         const categories = await Category.find({ isListed: true }).lean();
//         const brands = await Brand.find({ isBlocked: false }).lean();

//         let userData = null;
//         if (user) {
//             userData = await User.findOne({ _id: user });
//             if (userData) {
//                 const searchEntry = {
//                     category: category || null,
//                     brand: brand || null,
//                     priceRange: { gt, lt },
//                     searchedOn: new Date(),
//                 };
//                 userData.searchHistory.push(searchEntry);
//                 await userData.save();
//             }
//         }

//         res.render('shop', {
//             user: userData,
//             products: currentProducts,
//             category: categories,
//             brand: brands,
//             totalPages,
//             currentPage: validPage,
//             selectedCategory: category || null,
//             selectedBrand: brand || null,
//             selectedPriceRange: { gt, lt },
//             sort,
//         });
//     } catch (error) {
//         console.error("Error in sortProducts:", error);
//         res.redirect('/pageNotFound');
//     }
// };

const loadShoppingPage = async (req, res) => {
    try {
        const user = req.session.user;
        const { category, brand, gt, lt, sort, page } = req.query;

        const userData = user ? await User.findOne({ _id: user }) : null;

        const filterQuery = {
            isBlocked: false,
            quantity: { $gt: 0 },
        };

        if (category) {
            filterQuery.category = category;
        } else { 
            const listedCategories = await Category.find({ isListed: true });
            const listedCategoryIds = listedCategories.map(cat => cat._id.toString());
            filterQuery.category = { $in: listedCategoryIds };
        }

   
        if (brand) {
            filterQuery.brand = brand;
        }

        if (gt && lt) {
            filterQuery.salePrice = { $gt: Number(gt), $lt: Number(lt) };
        }

        let sortOptions = { createdOn: -1 }; 
        switch (sort) {
            case 'price_asc': sortOptions = { salePrice: 1 }; break;
            case 'price_desc': sortOptions = { salePrice: -1 }; break;
            case 'name_asc': sortOptions = { productName: 1 }; break;
            case 'name_desc': sortOptions = { productName: -1 }; break;
        }

        const limit = 6;
        const currentPage = Math.max(parseInt(page) || 1, 1);
        const skip = (currentPage - 1) * limit;

        const products = await Product.find(filterQuery)
            .sort(sortOptions)
            .skip(skip)
            .limit(limit)
            .populate({
                path: 'brand',
                select: 'brandName brandImage',
            });

        const totalProducts = await Product.countDocuments(filterQuery);
        const totalPages = Math.ceil(totalProducts / limit);

        const categories = await Category.find({ isListed: true });
        const brands = await Brand.find({ isBlocked: false });

        res.render('shop', {
            user: userData,
            products: products,
            brand: brands,
            category: categories,
            totalProducts: totalProducts,
            currentPage: currentPage,
            totalPages: totalPages,
            selectedCategory: category || null,
            selectedBrand: brand || null,
            selectedPriceRange: { gt, lt },
            sort: sort || null,
            searchQuery: req.session.searchQuery
        });
    } catch (error) {
        console.error("Error in loadShoppingPage:", error);
        res.redirect('/pageNotFound');
    }
};

const searchProducts = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = user ? await User.findOne({ _id: user }) : null;

        let search = req.body.query ? req.body.query.trim() : '';
        if (!search) {
            return res.render('shop', {
                user: userData,
                products: [],
                brand: [],
                category: [],
                totalPages: 0,
                currentPage: 1,
                count: 0,
                selectedCategory: null,
                selectedBrand: null,
                selectedPriceRange: { gt: null, lt: null },
                sort: null,
            });
        }

        const brands = await Brand.find({ isBlocked: false }).lean();
        const categories = await Category.find({ isListed: true }).lean();
        const categoryIds = categories.map(category => category._id.toString());

        let searchResult = await Product.find({
            productName: { $regex: search, $options: "i" },
            isBlocked: false,
            quantity: { $gt: 0 },
            category: { $in: categoryIds },
        }).lean();

        // Store search results and query in session
        req.session.searchResults = searchResult;
        req.session.searchQuery = search;

        const itemsPerPage = 6;
        const currentPage = parseInt(req.query.page) || 1;
        const totalPages = Math.ceil(searchResult.length / itemsPerPage);

        const startIndex = (currentPage - 1) * itemsPerPage;
        const currentProduct = searchResult.slice(startIndex, startIndex + itemsPerPage);

        res.render('shop', {
            user: userData,
            products: currentProduct,
            brand: brands,
            category: categories,
            totalPages,
            currentPage,
            count: searchResult.length,
            selectedCategory: req.query.category || null,
            selectedBrand: req.query.brand || null,
            selectedPriceRange: { gt: req.query.gt || null, lt: req.query.lt || null },
            sort: req.query.sort || null,
            searchQuery: req.session.searchQuery
        });

    } catch (error) {
        console.error("Error in searching product:", error);
        res.redirect('/pageNotFound');
    }
};

const paginateSearchResults = async (req, res) => {
    try {
        const user = req.session.user;
        const userData = user ? await User.findOne({ _id: user }) : null;

        const searchResult = req.session.searchResults || [];
        const searchQuery = req.session.searchQuery || '';

        const itemsPerPage = 6;
        const currentPage = parseInt(req.query.page) || 1;
        const totalPages = Math.ceil(searchResult.length / itemsPerPage);

        const startIndex = (currentPage - 1) * itemsPerPage;
        const currentProduct = searchResult.slice(startIndex, startIndex + itemsPerPage);

        const brands = await Brand.find({ isBlocked: false }).lean();
        const categories = await Category.find({ isListed: true }).lean();

        res.render('shop', {
            user: userData,
            products: currentProduct,
            brand: brands,
            category: categories,
            totalPages,
            currentPage,
            count: searchResult.length,
            selectedCategory: req.query.category || null,
            selectedBrand: req.query.brand || null,
            selectedPriceRange: { gt: req.query.gt || null, lt: req.query.lt || null },
            sort: req.query.sort || null,
            searchQuery,
        });
    } catch (error) {
        console.error("Error in paginating search results:", error);
        res.redirect('/pageNotFound');
    }
};


const filterProducts = async (req, res) => {
    try {
        const user = req.session.user;
        const { category, brand, gt, lt, sort, page } = req.query;

        const filterQuery = {
            isBlocked: false,
            quantity: { $gt: 0 },
        };

        if (category) {
            filterQuery.category = category;
        }

        if (brand) {
            filterQuery.brand = brand;
        }

        if (gt && lt) {
            filterQuery.salePrice = { $gt: Number(gt), $lt: Number(lt) };
        }

        let sortOptions = {};
        switch (sort) {
            case 'price_asc': sortOptions = { salePrice: 1 }; break;
            case 'price_desc': sortOptions = { salePrice: -1 }; break;
            case 'name_asc': sortOptions = { productName: 1 }; break;
            case 'name_desc': sortOptions = { productName: -1 }; break;
            default: sortOptions = { createdOn: -1 };
        }

        let findProducts = await Product.find(filterQuery).sort(sortOptions).lean();

        const itemsPerPage = 6;
        const currentPage = Math.max(parseInt(page) || 1, 1);
        const totalPages = Math.ceil(findProducts.length / itemsPerPage);
        const validPage = Math.min(currentPage, totalPages);
        const startIndex = (validPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentProducts = findProducts.slice(startIndex, endIndex);

        const categories = await Category.find({ isListed: true }).lean();
        const brands = await Brand.find({ isBlocked: false }).lean();

        let userData = null;
        if (user) {
            userData = await User.findOne({ _id: user });
            if (userData) {
                const searchEntry = {
                    category: category || null,
                    brand: brand || null,
                    priceRange: { gt, lt },
                    searchedOn: new Date(),
                };
                userData.searchHistory.push(searchEntry);
                await userData.save();
            }
        }

        res.render('shop', {
            user: userData,
            products: currentProducts,
            category: categories,
            brand: brands,
            totalPages,
            currentPage: validPage,
            selectedCategory: category || null,
            selectedBrand: brand || null,
            selectedPriceRange: { gt, lt },
            sort,
        });
    } catch (error) {
        console.error("Error in filterProducts:", error);
        res.redirect("/pageNotFound");
    }
};


module.exports = {
    loadHomePage,
    pageNotFound,
    loadLoginPage,
    login,
    loadSignupPage,
    signup,
    verifyOtp,
    resendOtp,
    logout,
    loadShoppingPage,
    filterProducts,
    //filterByPrice,
    //getSortProduct,
    //sortProducts,
    searchProducts,
    paginateSearchResults
}