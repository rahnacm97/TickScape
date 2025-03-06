const User = require('../models/userSchema');

const userAuth = async (req, res, next) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    try {
        const user = await User.findById(req.session.user);

        if (!user) {
            delete req.session.user;
            return res.redirect("/login");
        }

        if (user.isBlocked) {
            delete req.session.user;
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