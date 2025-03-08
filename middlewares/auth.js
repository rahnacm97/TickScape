const User = require('../models/userSchema');

//Session handling for user
const userAuth = async (req, res, next) => {
    let userId;

    if (req.user) {
        userId = req.user._id; 
    } else if (req.session.user) {
        userId = req.session.user; 
    } else {
        return res.redirect("/login");
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            if (req.user) req.logout(() => res.redirect("/login"));
            else {
                delete req.session.user;
                return res.redirect("/login");
            }
            return;
        }

        if (user.isBlocked) {
            if (req.user) req.logout(() => res.redirect("/404page", { 
                message: "Your account has been blocked by the admin. Please contact support." 
            }));
            else {
                delete req.session.user;
                return res.render("404page", { 
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

//Session handling for admin
const adminAuth = (req, res, next) => {
    if (!req.session.admin) {
        return res.redirect("/admin/login");
    }
    User.findOne({ _id: req.session.admin._id, isAdmin: true })
        .then(admin => {
            if (admin) {
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
}