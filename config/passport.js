const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const env = require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
},
async (accessToken, refreshToken, profile, done) => {

    
    try {
        let user = await User.findOne({ $or: [{ googleId: profile.id }, { email: profile.emails[0].value }] });

        if (user) {
            if (!user.googleId) {
                user.googleId = profile.id;
                await user.save();
            }
            if (user.email !== profile.emails[0].value) {
                user.email = profile.emails[0].value;
                await user.save();
            }
            return done(null, user);
        } else {
            if (!profile.id) {
                return done(new Error("Google ID is missing, cannot create user"), null);
            }

            let fullName = profile.displayName;
            let nameParts = fullName.split(" ");
            
            user = new User({
                fname: nameParts[0], 
                lname: nameParts.length > 1 ? nameParts.slice(1).join(" ") : "A",
                email: profile.emails[0].value,
                googleId: profile.id,
            });

            await user.save();
            return done(null, user);
        }
    } catch (error) {
        console.error("Error during Google OAuth:", error);
        return done(error, null);
    }
}
));



passport.serializeUser((user,done) => {
    done(null,user.id)
});

passport.deserializeUser((id,done) => {
    User.findById(id)
    .then(user => {
        done(null,user)
    })
    .catch(err => {
        console.error("Error deserializing user:", err);
        done(err,null)
    })
})


passport.session = function () {
    return function (req, res, next) {
        if (req.session && req.session.passport) {
            passport.deserializeUser(req.session.passport.user, (err, user) => {
                if (err) return next(err);
                req.user = user;
                next();
            });
        } else {
            next();
        }
    };
};


module.exports = passport;