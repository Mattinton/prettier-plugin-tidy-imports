// @ts-nocheck

// test
// testing

const test = "test";

// testing1

import { AuthProvider, FirebaseAppProvider, useFirebaseApp } from "reactfire";
import { AppProps } from "next/dist/shared/lib/router/router"; // test comment inline
import React, { ReactNode } from "react";
// test comment before
import { getAuth } from "firebase/auth";
/**
 * multi line first test
 */
import "tailwindcss/tailwind.css";
import "focus-visible";

const testing1 = "test";

import Head from "next/document";
// comment before layout
import { getLayout } from "~components/pages/_app/layout";
/**
 * another multi line first test
 */ import { ErrorBoundary, FallbackProps } from "react-error-boundary"; // in line comment
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  senderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
};

function Providers({
  children,
  cookies,
}: {
  children?: ReactNode;
  cookies?: string;
}) {
  const firebaseApp = useFirebaseApp();
  const auth = getAuth(firebaseApp);

  return <AuthProvider sdk={auth}>{children}</AuthProvider>;
}

function App({ Component, pageProps }: AppProps) {
  const Layout = getLayout(Component);

  function ClientErrorFallback(_props: FallbackProps) {
    return <Layout>Oops! Something went wrong.</Layout>;
  }

  return (
    <FirebaseAppProvider firebaseConfig={firebaseConfig}>
      <Providers cookies={pageProps.cookies}>
        <Head>
          <meta
            content="initial-scale=1, width=device-width, shrink-to-fit=no, viewport-fit=cover"
            name="viewport"
          />
        </Head>

        <ErrorBoundary FallbackComponent={ClientErrorFallback}>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </ErrorBoundary>
      </Providers>
    </FirebaseAppProvider>
  );
}

export default App;
