const User = require("../../models/userSchema");
const CustomError = require("../../utils/customError");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const pageerror = async (req, res, next) => {
  try {
    res.status(404).render("admin-error", {
      message: "The requested admin page does not exist.",
    });
  } catch (err) {
    console.error("Error rendering admin error page:", err);
    //res.status(500).render("500page", { message: "Something went wrong." });
    next(new CustomError(500, "Failed to render error page"));
  }
};

//Login Loading
const adminLoadLogin = async (req, res, next) => {
  try {
    if (req.session.admin) {
      return res.redirect("/admin/dashboard");
    }
    res.render("admin-login", { message: null });
  } catch (error) {
    next(new CustomError(500, "Failed to load admin login page"));
  }
};

const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.render("admin-login", {
        message: "Email and password are required",
      });
    }

    // Find admin user
    const admin = await User.findOne({ email, isAdmin: true });
    if (!admin) {
      return res.render("admin-login", {
        message: "Invalid credentials or not an admin",
      });
    }

    // Check password
    const passwordMatch = await bcrypt.compare(password, admin.password);
    if (!passwordMatch) {
      return res.render("admin-login", { message: "Invalid password" });
    }

    // Set session and redirect
    req.session.admin = { _id: admin._id };
    res.redirect("/admin/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    next(new CustomError(500, "Admin login failed"));
  }
};

// Admin Logout
const logout = async (req, res) => {
  try {
    delete req.session.admin;
    res.redirect("/admin/login");
  } catch (error) {
    console.log("Unexpected Error", error);
    //res.redirect("/pageerror");
    next(
      error instanceof CustomError
        ? error
        : new CustomError(500, "Failed to logout")
    );
  }
};

module.exports = {
  pageerror,
  adminLoadLogin,
  adminLogin,
  logout,
};
