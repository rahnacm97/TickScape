const User = require('../models/userSchema');


const redirectIfUserLoggedIn = (req, res, next) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    next();
};

const redirectIfAdminLoggedIn = (req, res, next) => {
    if (req.session.admin && !req.path.startsWith('/auth/google')) {
        return res.redirect('/admin/dashboard');
    }
    next();
};

const userAuth = async (req, res, next) => {
    let userId;

    if (req.session.user) {
        userId = req.session.user;
    } else if (req.user) {
        userId = req.user._id; 
    } else {
        console.log("No user authenticated, redirecting to login");
        return res.redirect("/login");
    }
    try {     
        const user = await User.findById(userId);
        if (!user) {
           // console.log("User not found, logging out and redirecting to login");
            if (req.user) {
                req.logout((err) => {
                    if (err) console.error("Error during logout:", err);
                    if (req.session.passport) delete req.session.passport;
                    res.redirect("/login");
                });
            } else {
                delete req.session.user; 
                res.redirect("/login");
            }
            return;
        }
        if (user.isBlocked) {
            console.log("User blocked",req.user);
            if (req.user) {               
                req.logout((err) => {
                    if (err) console.error("Error during logout:", err);
                    if (req.session.passport) 
                        delete req.session.passport;
                        res.render("404page", { 
                        message: "Your account has been blocked by the admin. Please contact support." 
                    });
                });
            } else {
                delete req.session.user;
                res.render("404page", { 
                    message: "Your account has been blocked by the admin. Please contact support." 
                });
            }
            return;
        }

        req.authenticatedUser = user;
        next();
    } catch (error) {
        console.error("Error in user authentication middleware:", error);
        res.status(500).send("Internal Server Error");
    }
};


const adminAuth = (req, res, next) => {
    if (!req.session.admin) {
        console.log("Logging out")
        return res.redirect("/admin/login");
    }
    //console.log(req.session.admin);
    User.findOne({ _id: req.session.admin._id })
        .then(admin => {
            if (admin && admin.isAdmin) {
                next();
            } else {
                delete req.session.admin; 
                res.redirect("/admin/login");
            }
        })
        .catch(error => {
            console.log("Error in admin auth middleware", error);
            res.status(500).send("Internal Server Error");
        });
};


module.exports = {
    userAuth,
    adminAuth,
    redirectIfUserLoggedIn,
    redirectIfAdminLoggedIn
}