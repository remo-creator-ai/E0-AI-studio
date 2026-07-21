type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          display_name: string | null;
          avatar_url: string | null;
          role: 'user' | 'master';
          login_id: string | null;
          status: 'active' | 'suspended';
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          display_name?: string | null;
          avatar_url?: string | null;
          role?: 'user' | 'master';
          login_id?: string | null;
          status?: 'active' | 'suspended';
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          role?: 'user' | 'master';
          login_id?: string | null;
          status?: 'active' | 'suspended';
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          key_message: string | null;
          duration: number;
          style: string;
          idea: string;
          scenes: Json;
          grid_images: Json;
          layout: string;
          aspect_ratio: string | null;
          scene_count: number | null;
          thumbnail: string | null;
          current_stage: string | null;
          original_creator_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          key_message?: string | null;
          duration: number;
          style: string;
          idea: string;
          scenes: Json;
          grid_images: Json;
          layout: string;
          aspect_ratio?: string | null;
          scene_count?: number | null;
          thumbnail?: string | null;
          current_stage?: string | null;
          original_creator_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          key_message?: string | null;
          duration?: number;
          style?: string;
          idea?: string;
          scenes?: Json;
          grid_images?: Json;
          layout?: string;
          aspect_ratio?: string | null;
          scene_count?: number | null;
          thumbnail?: string | null;
          current_stage?: string | null;
          original_creator_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      admin_config: {
        Row: {
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: string;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_credits: {
        Row: {
          id: string;
          user_id: string;
          balance: number;
          max_credits: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          balance?: number;
          max_credits?: number;
          updated_at?: string;
        };
        Update: {
          balance?: number;
          max_credits?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: string;
          description: string | null;
          balance_after: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          type: string;
          description?: string | null;
          balance_after: number;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          amount?: number;
          type?: string;
          description?: string | null;
          balance_after?: number;
        };
        Relationships: [];
      };
      consent_history: {
        Row: {
          id: string;
          user_id: string;
          document_type: 'terms' | 'privacy' | 'ai_content';
          document_version: string;
          agreed_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          document_type: 'terms' | 'privacy' | 'ai_content';
          document_version: string;
          agreed_at?: string;
        };
        Update: {
          document_type?: 'terms' | 'privacy' | 'ai_content';
          document_version?: string;
        };
        Relationships: [];
      };
      intro_survey_responses: {
        Row: {
          id: string;
          user_id: string;
          status: 'completed' | 'skipped';
          survey_version: string;
          q1_role: string | null;
          q2_content_type: string | null;
          q3_industry: string | null;
          q4_expected_volume: string | null;
          q5_ai_experience: string | null;
          q6_referral: string | null;
          submitted_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status: 'completed' | 'skipped';
          survey_version?: string;
          q1_role?: string | null;
          q2_content_type?: string | null;
          q3_industry?: string | null;
          q4_expected_volume?: string | null;
          q5_ai_experience?: string | null;
          q6_referral?: string | null;
          submitted_at?: string;
        };
        Update: {
          status?: 'completed' | 'skipped';
        };
        Relationships: [];
      };
      credit_requests: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          reason: string;
          attachments: string[];
          status: 'pending' | 'approved' | 'rejected' | 'cancelled';
          granted_amount: number | null;
          reviewer: string | null;
          reviewer_note: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          reason: string;
          attachments?: string[];
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
          granted_amount?: number | null;
          reviewer?: string | null;
          reviewer_note?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled';
          granted_amount?: number | null;
          reviewer?: string | null;
          reviewer_note?: string | null;
          reviewed_at?: string | null;
        };
        Relationships: [];
      };
      production_requests: {
        Row: {
          id: string;
          project_id: string | null;
          project_title: string;
          requester_name: string;
          requester_email: string;
          user_id: string | null;
          aspect_ratio: string;
          scene_count: number;
          purpose: string;
          additional_notes: string | null;
          extra_file_urls: string[] | null;
          storyboard_url: string | null;
          assets_url: string | null;
          storyboard_downloaded: boolean;
          assets_downloaded: boolean;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
          project_title: string;
          requester_name: string;
          requester_email: string;
          user_id?: string | null;
          aspect_ratio?: string;
          scene_count?: number;
          purpose: string;
          additional_notes?: string | null;
          extra_file_urls?: string[] | null;
          storyboard_url?: string | null;
          assets_url?: string | null;
          storyboard_downloaded?: boolean;
          assets_downloaded?: boolean;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          project_id?: string | null;
          project_title?: string;
          requester_name?: string;
          requester_email?: string;
          user_id?: string | null;
          aspect_ratio?: string;
          scene_count?: number;
          purpose?: string;
          additional_notes?: string | null;
          extra_file_urls?: string[] | null;
          storyboard_url?: string | null;
          assets_url?: string | null;
          storyboard_downloaded?: boolean;
          assets_downloaded?: boolean;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_master: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      get_project_summaries: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          id: string;
          title: string;
          style: string;
          duration: number;
          created_at: string;
          updated_at: string;
          scenes_count: number;
          images_done: number;
          videos_done: number;
          thumbnail: string | null;
          current_stage: string | null;
          original_creator_id: string | null;
          creator_display_name: string | null;
          creator_avatar_url: string | null;
        }[];
      };
      get_public_profile: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          display_name: string | null;
          avatar_url: string | null;
        }[];
      };
      initialize_user_credits: {
        Args: {
          p_user_id: string;
        };
        Returns: {
          balance: number;
          max_credits: number;
        }[];
      };
      deduct_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_description?: string;
        };
        Returns: number;
      };
      refund_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_description?: string;
        };
        Returns: number;
      };
      admin_get_all_requests: {
        Args: Record<never, never>;
        Returns: {
          id: string;
          project_id: string | null;
          project_title: string;
          requester_name: string;
          requester_email: string;
          user_id: string | null;
          aspect_ratio: string;
          scene_count: number;
          purpose: string;
          additional_notes: string | null;
          extra_file_urls: string[] | null;
          storyboard_url: string | null;
          assets_url: string | null;
          storyboard_downloaded: boolean;
          assets_downloaded: boolean;
          status: string;
          created_at: string;
          updated_at: string;
        }[];
      };
      admin_update_request_status: {
        Args: {
          p_request_id: string;
          p_status: string;
        };
        Returns: void;
      };
      get_master_credit_pool: {
        Args: Record<never, never>;
        Returns: {
          pool_limit: number;
          granted: number;
          remaining: number;
        }[];
      };
      master_grant_credit: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reason?: string;
          p_request_id?: string | null;
        };
        Returns: {
          ok: boolean;
          new_balance: number;
          error: string | null;
        }[];
      };
      cancel_credit_request: {
        Args: {
          p_request_id: string;
        };
        Returns: boolean;
      };
      reject_credit_request: {
        Args: {
          p_request_id: string;
          p_note?: string;
        };
        Returns: boolean;
      };
    };
  };
}
