declare module "intuit-oauth" {
	interface OAuthClientConfig {
		clientId: string;
		clientSecret: string;
		environment: "sandbox" | "production";
		redirectUri: string;
	}

	interface TokenData {
		access_token: string;
		refresh_token: string;
		expires_in: number;
		x_refresh_token_expires_in: number;
		realmId?: string;
	}

	interface AuthResponse {
		getJson(): TokenData;
	}

	class OAuthClient {
		static scopes: {
			Accounting: string;
			Payment: string;
			OpenId: string;
		};

		constructor(config: OAuthClientConfig);

		authorizeUri(options: { scope: string[]; state?: string }): string;
		createToken(url: string): Promise<AuthResponse>;
		refresh(): Promise<AuthResponse>;
		getToken(): {
			realmId: string;
			access_token: string;
			refresh_token: string;
		};
		setToken(
			token: Partial<{ access_token: string; refresh_token: string }>
		): void;
	}

	export = OAuthClient;
}
