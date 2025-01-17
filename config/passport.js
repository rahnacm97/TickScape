const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const env = require('dotenv').config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
},
async (accessToken,refreshToken,profile,done) => {
    try{
        let user = await User.findOne({ $or: [{ googleId: profile.id }, { email: profile.emails[0].value }] });
        //let user = await User.findOne({googleId:profile.id});
        // if(user){
        //     return done(null,user);
        // }
        if (user) {
    
            //if (!user.googleId && profile.id) {
            if (!user.googleId) {
                user.googleId = profile.id;
                await user.save();
            }
            if (user.email !== profile.emails[0].value) {
                user.email = profile.emails[0].value;
                await user.save();
            }
            return done(null, user);
        }
        else{
            if (!profile.id) {
                return done(new Error("Google ID is missing, cannot create user"), null);
            }
            //const googleId = profile.id || "defaultGoogleId";

            user = new User({

                fname: profile.displayName,
                lname: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,  
            });

            await user.save();
            return done(null, user);
        }
    }catch(error){
        console.error("Error during Google OAuth:", error);
        return done(error,null)
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

module.exports = passport;