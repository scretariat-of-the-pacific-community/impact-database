import NextAuth, { NextAuthOptions } from 'next-auth';
import { JWT } from 'next-auth/jwt';

// SPC SSO Provider Configuration
const spcSSOProvider = {
  id: "spc-sso",
  name: "SPC SSO",
  type: "oauth" as const,
  authorization: {
    url: process.env.SPC_SSO_AUTHORIZATION_URL || "https://sso.spc.int/auth/realms/spc/protocol/openid-connect/auth",
    params: {
      scope: "openid email profile",
      response_type: "code",
    },
  },
  token: process.env.SPC_SSO_TOKEN_URL || "https://sso.spc.int/auth/realms/spc/protocol/openid-connect/token",
  userinfo: process.env.SPC_SSO_USERINFO_URL || "https://sso.spc.int/auth/realms/spc/protocol/openid-connect/userinfo",
  clientId: process.env.SPC_SSO_CLIENT_ID,
  clientSecret: process.env.SPC_SSO_CLIENT_SECRET,
  profile(profile: any) {
    return {
      id: profile.sub,
      name: profile.name || profile.preferred_username,
      email: profile.email,
      image: profile.picture,
      roles: profile.roles || ['viewer'],
      organization: profile.organization,
      country: profile.country,
    };
  },
};

export const authOptions: NextAuthOptions = {
  providers: [
    spcSSOProvider,
    // Fallback for development
    ...(process.env.NODE_ENV === 'development' ? [{
      id: "dev-login",
      name: "Development Login",
      type: "credentials" as const,
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        // Development-only login
        if (credentials?.email === "viewer@spc.int" && credentials?.password === "viewer123") {
          return {
            id: "dev-viewer",
            email: "viewer@spc.int",
            name: "Development Viewer",
            roles: ['viewer'],
            organization: "SPC",
            country: "Development"
          };
        }
        return null;
      }
    }] : [])
  ],
  
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Persist user data in JWT
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.roles = (profile as any).roles || ['viewer'];
        token.organization = (profile as any).organization;
        token.country = (profile as any).country;
      }
      
      if (user) {
        token.roles = (user as any).roles || ['viewer'];
        token.organization = (user as any).organization;
        token.country = (user as any).country;
      }
      
      return token;
    },
    
    async session({ session, token }) {
      // Send properties to the client
      if (token) {
        session.accessToken = token.accessToken as string;
        session.user.roles = token.roles as string[];
        session.user.organization = token.organization as string;
        session.user.country = token.country as string;
      }
      
      return session;
    },
  },
  
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  
  secret: process.env.NEXTAUTH_SECRET,
};

export default NextAuth(authOptions);
