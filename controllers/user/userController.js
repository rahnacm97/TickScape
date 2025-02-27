const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Banner = require('../../models/bannerSchema');
const Brand = require('../../models/brandSchema');
const CustomError = require('../../utils/customError');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const CryptoJS = require("crypto-js");

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

const loadHomePage = async(req,res,next) => {
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
        //res.status(500).send("Server Error");
        next(new CustomError(500, "Internal Server Error"))
    }
}

const loadLoginPage = async(req,res,next) => {
    try{
        return res.render('login',{
            user: req.session.user || null
        });
    }catch(err){
        res.redirect('/pageNotFound');
    }
}

const login = async(req,res,next) => {
    try{

        // const bytes = CryptoJS.AES.decrypt(password, "your-secret-key");
        // const decryptedPassword = bytes.toString(CryptoJS.enc.Utf8);
        
        const {email,password} = req.body;
        //console.log("password",password);
        const findUser = await User.findOne({isAdmin: 0,email:email});
        if(!findUser){
            return res.render("login",{message:"User Not Found"});
        }
        if(findUser.isBlocked){
            return res.render("login",{message:"User is Blocked by Admin"});
        }

       const passwordMatch = await bcrypt.compare(password,findUser.password);

        console.log("Password Match:", passwordMatch);
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

// const signup = async(req,res) => {
//     try{
//         const {fname,lname,phone,email, password,cpassword} = req.body;
//         if(password !== cpassword){
//             return res.render('signup',{message:"Password do not match"});
//         }
//         const findUser = await User.findOne({email});
//         if(findUser){
//             return res.render('signup',{message:"Email already exists"});
//         }
//         console.log

//         const otp = generateOtp();

//         const emailSent = await sentVerification(email,otp);

//         if(!emailSent){
//             return res.json("email-error");
//         }

//         req.session.userOtp = otp;
//         req.session.userData = {fname,lname,phone,email,password};

//         setTimeout(()=>{
//             delete req.session.userOtp
//             req.session.save((err)=>{
//                 if(err){
//                     console.log('Error deleting session');
//                 }
//             })
//             console.log('otp expired');
//           },60000)
//           //console.log('4');
        
//         res.render("verify-otp");
//         console.log("OTP Sent ",otp);

//     }catch(err){
//         console.error("Signup Error",err);
//         res.redirect('/pageNotFound');
//     }
// }

const signup = async (req, res) => {
    try {
        const { fname, lname, phone, email, password, cpassword, referralCode } = req.body;

        // Password confirmation check
        if (password !== cpassword) {
            return res.render('signup', { message: "Passwords do not match" });
        }

        // Check if the email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('signup', { message: "Email already exists" });
        }

        // Generate OTP
        const otp = generateOtp();
        const emailSent = await sentVerification(email, otp);

        if (!emailSent) {
            return res.json("email-error");
        }

        // Store user data in session before verification
        req.session.userOtp = otp;
        req.session.userData = { fname, lname, phone, email, password, referralCode };

        // OTP expiration logic (1 minute)
        setTimeout(() => {
            delete req.session.userOtp;
            req.session.save((err) => {
                if (err) {
                    console.log('Error deleting session');
                }
            });
            console.log('OTP expired');
        }, 60000);

        res.render("verify-otp");
        console.log("OTP Sent:", otp);

    } catch (err) {
        console.error("Signup Error", err);
        res.redirect('/pageNotFound');
    }
};

const securePassword = async (password) => {
    try{
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
    }catch(error){
        console.error("Error hashing password:", error);
        throw new Error("Password hashing failed");
    }
}

// const verifyOtp = async (req,res) => {
//     try{
//         const {otp} = req.body;
//         console.log(otp);

//         if(otp === req.session.userOtp){
//             const user = req.session.userData;
//             const passwordHash = await securePassword(user.password);
//             const saveUserData = new User({
//                 fname:user.fname,
//                 lname:user.lname,
//                 email:user.email,
//                 phone:user.phone,
//                 password:passwordHash,
//                 isAdmin:0,
//             })
//             await saveUserData.save();
//             req.session.user = saveUserData._id;

//             res.json({success:true,redirectUrl:"/login"});
//         }else{
//             res.status(400).json({success:false, message:"Invalid OTP, Please try again"});
//         }
//     }catch(error){
//         console.error("error verifying OTP",error);
//         res.status(500).json({success:false, message:"An error occured"});
//     }
// }

const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        console.log(otp);

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            // Check if referral code is provided and find the referrer
            let referrer = null;
            if (user.referralCode) {
                referrer = await User.findOne({ referalCode: user.referralCode });
            }

            const saveUserData = new User({
                fname: user.fname,
                lname: user.lname,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
                isAdmin: false,
                redeemed: !!referrer,  
            });

            await saveUserData.save();

            if (referrer) {
                const referralBonus = 100; 
                referrer.wallet.push({ amount: referralBonus, date: new Date() });

                let totalBonus = referrer.wallet.reduce((sum, entry) => sum + entry.amount, 0);

                referrer.redeemedUser.push(saveUserData._id);
                await referrer.save();

                console.log(`Referral bonus added! Total earned: ${totalBonus}`);
            }

            req.session.user = saveUserData._id;

            res.json({ success: true, redirectUrl: "/login" });
        } else {
            res.status(400).json({ success: false, message: "Invalid OTP, Please try again" });
        }
    } catch (error) {
        console.error("Error verifying OTP", error);
        res.status(500).json({ success: false, message: "An error occurred" });
    }
};

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
        
        if (req.session.appliedCoupon) {
            delete req.session.appliedCoupon; // Remove applied coupon from session
        }

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


const loadShoppingPage = async (req, res, next) => {
    try {
        const user = req.session.user;
        const { category, brand, gt, lt, sort, page, search } = req.query;
        const searchQuery = search || ''; 

        //console.log("Received query params:", req.query);
        //console.log("Parsed values - Page:", page, "GT:", gt, "LT:", lt);

        const userData = user ? await User.findOne({ _id: user }) : null;

        const filterQuery = {
            isBlocked: false,
            //quantity: { $gt: 0 },
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

        if (searchQuery) {
            //console.log("Search Query Received:", searchQuery); 
            const matchingCategories = await Category.find({
                name: { $regex: searchQuery, $options: "i" },
                isListed: true,
            }).lean();
        
            const matchingCategoryIds = matchingCategories.map(cat => cat._id.toString());
        
            filterQuery.$or = [
                { productName: { $regex: searchQuery, $options: "i" } },
                { category: { $in: matchingCategoryIds } }
            ];
        }

        let sortOptions = { createdAt: -1 }; 
        switch (sort) {
            case 'new_desc': sortOptions = { createdAt: -1 }; break;
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
            })
            .populate({
                path: 'category',
                select: 'name',
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
            searchQuery,
        });
       
    } catch (error) {
        console.error("Error in loadShoppingPage:", error);
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
}