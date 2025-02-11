const User = require('../models/userSchema');

// const userAuth = (req,res,next) => {
//     if(req.session.user){
//         User.findById(req.session.user)
//         .then(data => {
//             if(data && !data.isBlocked){
//                 next();
//             }else{
//                 res.redirect("/login");
//             }
//         })
//         .catch(error => {
//             console.log("error in user auth middleware.");
//             res.status(500).send("Internal Server Error");
//         })
//     }else{
//         res.redirect("/login");
//     }
// }

const userAuth = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    try {
        const user = await User.findById(req.session.user);

        if (!user) {
            req.session.destroy();
            return res.redirect("/login");
        }

        if (user.isBlocked) {
            req.session.destroy();
            return res.render("404page", { 
                message: "Your account has been blocked by the admin. Please contact support." 
            });
        }

        next();
    } catch (error) {
        console.log("Error in user authentication middleware:", error);
        res.status(500).send("Internal Server Error");
    }
};

const adminAuth = (req,res,next) => {
    User.findOne({isAdmin:true})
    .then(data =>{
        if(data){
            next();
        }else{
            res.redirect("/admin/login");
        }
    })
    .catch(error => {
        console.log("Error in admin auth middleware",error);
        res.status(500).send("Internal Server Error");
    })
}

module.exports = {
    userAuth,
    adminAuth,
}