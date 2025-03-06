const User = require('../../models/userSchema');
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');

const pageerror = async (req,res) => {
    res.render('admin-error');
}

const adminLoadLogin = async (req,res) => {
    if(req.session.admin){
        return res.redirect('/admin/dashboard')
    }
    res.render("admin-login",{message:null});
}

const adminLogin = async(req,res) => {
    try {
        const {email,password} = req.body;
        const admin = await User.findOne({email,isAdmin:true});
        if(admin){
            const passwordMatch = bcrypt.compare(password,admin.password);
            if(passwordMatch){
                //req.session.admin = true;
                req.session.admin = { _id: admin._id };
                return res.redirect('/admin/dashboard');
            }else{
                return res.redirect("/login");
            }
        }else{
            return res.redirect("/login");
        }
    } catch (error) {
        console.log("Login error",error);
        return res.redirect('/pageerror');
        
    }
}


// Admin Logout
const logout = async (req, res) => {
    try {
        delete req.session.admin; 
        res.redirect('/admin/login');
    } catch (error) {
        console.log("Unexpected Error", error);
        res.redirect("/pageerror");
    }
};

module.exports = {
    pageerror,
    adminLoadLogin,
    adminLogin,
    logout,
}