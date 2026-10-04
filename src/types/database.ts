export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      document_events: {
        Row: {
          actor_email: string | null;
          actor_name: string | null;
          actor_recipient_id: string | null;
          actor_user_id: string | null;
          created_at: string;
          description: string;
          document_id: string;
          hash: string | null;
          id: number;
          ip: unknown;
          metadata: NonNullable<Json>;
          prev_hash: string | null;
          type: Database['public']['Enums']['event_type'];
          user_agent: string | null;
        };
        Insert: {
          actor_email?: string | null;
          actor_name?: string | null;
          actor_recipient_id?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          description: string;
          document_id: string;
          hash?: string | null;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          prev_hash?: string | null;
          type: Database['public']['Enums']['event_type'];
          user_agent?: string | null;
        };
        Update: {
          actor_email?: string | null;
          actor_name?: string | null;
          actor_recipient_id?: string | null;
          actor_user_id?: string | null;
          created_at?: string;
          description?: string;
          document_id?: string;
          hash?: string | null;
          id?: never;
          ip?: unknown;
          metadata?: NonNullable<Json>;
          prev_hash?: string | null;
          type?: Database['public']['Enums']['event_type'];
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'document_events_actor_recipient_id_fkey';
            columns: ['actor_recipient_id'];
            isOneToOne: false;
            referencedRelation: 'document_recipients';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_events_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_events_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_events_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          },
        ];
      };
      document_pages: {
        Row: {
          box_x_pt: number;
          box_y_pt: number;
          document_id: string;
          height_pt: number;
          page_number: number;
          rotation: number;
          width_pt: number;
        };
        Insert: {
          box_x_pt?: number;
          box_y_pt?: number;
          document_id: string;
          height_pt: number;
          page_number: number;
          rotation?: number;
          width_pt: number;
        };
        Update: {
          box_x_pt?: number;
          box_y_pt?: number;
          document_id?: string;
          height_pt?: number;
          page_number?: number;
          rotation?: number;
          width_pt?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'document_pages_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          },
        ];
      };
      document_recipients: {
        Row: {
          completed_at: string | null;
          created_at: string;
          decline_reason: string | null;
          declined_at: string | null;
          document_id: string;
          email: string;
          id: string;
          last_reminded_at: string | null;
          name: string;
          role: Database['public']['Enums']['recipient_role'];
          sent_at: string | null;
          signing_order: number;
          status: Database['public']['Enums']['recipient_status'];
          user_id: string | null;
          viewed_at: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          decline_reason?: string | null;
          declined_at?: string | null;
          document_id: string;
          email: string;
          id?: string;
          last_reminded_at?: string | null;
          name: string;
          role?: Database['public']['Enums']['recipient_role'];
          sent_at?: string | null;
          signing_order?: number;
          status?: Database['public']['Enums']['recipient_status'];
          user_id?: string | null;
          viewed_at?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          decline_reason?: string | null;
          declined_at?: string | null;
          document_id?: string;
          email?: string;
          id?: string;
          last_reminded_at?: string | null;
          name?: string;
          role?: Database['public']['Enums']['recipient_role'];
          sent_at?: string | null;
          signing_order?: number;
          status?: Database['public']['Enums']['recipient_status'];
          user_id?: string | null;
          viewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'document_recipients_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_recipients_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_recipients_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      document_user_state: {
        Row: {
          document_id: string;
          hidden_at: string | null;
          last_opened_at: string | null;
          user_id: string;
        };
        Insert: {
          document_id: string;
          hidden_at?: string | null;
          last_opened_at?: string | null;
          user_id: string;
        };
        Update: {
          document_id?: string;
          hidden_at?: string | null;
          last_opened_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_user_state_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_user_state_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_user_state_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      documents: {
        Row: {
          allow_decline: boolean;
          certificate_path: string | null;
          completed_at: string | null;
          completed_path: string | null;
          completed_sha256: string | null;
          created_at: string;
          current_signing_order: number | null;
          deleted_at: string | null;
          email_message: string | null;
          email_subject: string | null;
          expires_at: string | null;
          file_size_bytes: number | null;
          id: string;
          original_path: string | null;
          original_sha256: string | null;
          owner_id: string;
          page_count: number | null;
          reminder_first_after_days: number | null;
          reminder_repeat_every_days: number | null;
          require_email_otp: boolean;
          sent_at: string | null;
          status: Database['public']['Enums']['document_status'];
          title: string;
          updated_at: string;
          void_reason: string | null;
          voided_at: string | null;
        };
        Insert: {
          allow_decline?: boolean;
          certificate_path?: string | null;
          completed_at?: string | null;
          completed_path?: string | null;
          completed_sha256?: string | null;
          created_at?: string;
          current_signing_order?: number | null;
          deleted_at?: string | null;
          email_message?: string | null;
          email_subject?: string | null;
          expires_at?: string | null;
          file_size_bytes?: number | null;
          id?: string;
          original_path?: string | null;
          original_sha256?: string | null;
          owner_id: string;
          page_count?: number | null;
          reminder_first_after_days?: number | null;
          reminder_repeat_every_days?: number | null;
          require_email_otp?: boolean;
          sent_at?: string | null;
          status?: Database['public']['Enums']['document_status'];
          title: string;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Update: {
          allow_decline?: boolean;
          certificate_path?: string | null;
          completed_at?: string | null;
          completed_path?: string | null;
          completed_sha256?: string | null;
          created_at?: string;
          current_signing_order?: number | null;
          deleted_at?: string | null;
          email_message?: string | null;
          email_subject?: string | null;
          expires_at?: string | null;
          file_size_bytes?: number | null;
          id?: string;
          original_path?: string | null;
          original_sha256?: string | null;
          owner_id?: string;
          page_count?: number | null;
          reminder_first_after_days?: number | null;
          reminder_repeat_every_days?: number | null;
          require_email_otp?: boolean;
          sent_at?: string | null;
          status?: Database['public']['Enums']['document_status'];
          title?: string;
          updated_at?: string;
          void_reason?: string | null;
          voided_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'documents_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'documents_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_path: string | null;
          created_at: string;
          default_expiry_days: number;
          default_reminder: NonNullable<Json>;
          email: string;
          full_name: string;
          id: string;
          locale: string;
          notification_prefs: NonNullable<Json>;
          phone: string | null;
          theme: string;
          updated_at: string;
        };
        Insert: {
          avatar_path?: string | null;
          created_at?: string;
          default_expiry_days?: number;
          default_reminder?: NonNullable<Json>;
          email: string;
          full_name: string;
          id: string;
          locale?: string;
          notification_prefs?: NonNullable<Json>;
          phone?: string | null;
          theme?: string;
          updated_at?: string;
        };
        Update: {
          avatar_path?: string | null;
          created_at?: string;
          default_expiry_days?: number;
          default_reminder?: NonNullable<Json>;
          email?: string;
          full_name?: string;
          id?: string;
          locale?: string;
          notification_prefs?: NonNullable<Json>;
          phone?: string | null;
          theme?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          count: number;
          key: string;
          window_start: string;
        };
        Insert: {
          count: number;
          key: string;
          window_start: string;
        };
        Update: {
          count?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      saved_signatures: {
        Row: {
          created_at: string;
          font_key: string | null;
          id: string;
          is_default: boolean;
          kind: Database['public']['Enums']['signature_kind'];
          method: Database['public']['Enums']['signature_method'];
          storage_path: string;
          typed_text: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          font_key?: string | null;
          id?: string;
          is_default?: boolean;
          kind: Database['public']['Enums']['signature_kind'];
          method: Database['public']['Enums']['signature_method'];
          storage_path: string;
          typed_text?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          font_key?: string | null;
          id?: string;
          is_default?: boolean;
          kind?: Database['public']['Enums']['signature_kind'];
          method?: Database['public']['Enums']['signature_method'];
          storage_path?: string;
          typed_text?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'saved_signatures_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'saved_signatures_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          avatar_path: string | null;
          full_name: string | null;
          id: string | null;
        };
        Insert: {
          avatar_path?: string | null;
          full_name?: string | null;
          id?: string | null;
        };
        Update: {
          avatar_path?: string | null;
          full_name?: string | null;
          id?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      can_upload_original: { Args: { p_document_id: string }; Returns: boolean };
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
      document_display_status: {
        Args: {
          p_current_signing_order: number;
          p_document_id: string;
          p_status: Database['public']['Enums']['document_status'];
        };
        Returns: string;
      };
      finalize_original_upload: {
        Args: {
          p_document_id: string;
          p_pages: Json;
          p_path: string;
          p_sha256: string;
          p_size_bytes: number;
        };
        Returns: boolean;
      };
      get_dashboard_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          completed: number;
          drafts: number;
          needs_signature: number;
          waiting: number;
        }[];
      };
      get_document: {
        Args: { p_document_id: string };
        Returns: {
          completed_at: string;
          created_at: string;
          display_status: string;
          file_size_bytes: number;
          hidden: boolean;
          id: string;
          is_owner: boolean;
          owner_id: string;
          owner_name: string;
          page_count: number;
          sent_at: string;
          status: Database['public']['Enums']['document_status'];
          title: string;
          updated_at: string;
          upload_incomplete: boolean;
          void_reason: string;
          voided_at: string;
        }[];
      };
      get_storage_usage: {
        Args: Record<PropertyKey, never>;
        Returns: {
          bytes: number;
          document_count: number;
        }[];
      };
      is_active_participant: { Args: { p_document_id: string }; Returns: boolean };
      is_document_owner: { Args: { p_document_id: string }; Returns: boolean };
      is_draft_owner: { Args: { p_document_id: string }; Returns: boolean };
      like_pattern: { Args: { p_text: string }; Returns: string };
      link_recipients_to_user: { Args: Record<PropertyKey, never>; Returns: number };
      list_document_senders: {
        Args: Record<PropertyKey, never>;
        Returns: {
          full_name: string;
          id: string;
        }[];
      };
      list_documents: {
        Args: {
          p_bucket?: string;
          p_cursor_id?: string;
          p_cursor_value?: string;
          p_filters?: Json;
          p_limit?: number;
          p_search?: string;
          p_sort?: string;
        };
        Returns: {
          created_at: string;
          cursor_value: string;
          display_status: string;
          file_size_bytes: number;
          id: string;
          owner_id: string;
          owner_name: string;
          page_count: number;
          participant_count: number;
          participants: Json;
          signers_completed: number;
          signers_total: number;
          status: Database['public']['Enums']['document_status'];
          title: string;
          updated_at: string;
          upload_incomplete: boolean;
        }[];
      };
      list_recent_documents: {
        Args: { p_limit?: number };
        Returns: {
          display_status: string;
          id: string;
          owner_id: string;
          owner_name: string;
          title: string;
          updated_at: string;
        }[];
      };
      log_event: {
        Args: {
          p_actor_email?: string;
          p_actor_name?: string;
          p_actor_recipient_id?: string;
          p_actor_user_id?: string;
          p_description: string;
          p_document_id: string;
          p_ip?: unknown;
          p_metadata?: Json;
          p_type: Database['public']['Enums']['event_type'];
          p_user_agent?: string;
        };
        Returns: number;
      };
      my_documents: {
        Args: Record<PropertyKey, never>;
        Returns: {
          display_status: string;
          id: string;
          last_activity_at: string;
          owner_id: string;
          status: Database['public']['Enums']['document_status'];
          title: string;
          updated_at: string;
        }[];
      };
      request_header: { Args: { p_name: string }; Returns: string };
      request_ip: { Args: Record<PropertyKey, never>; Returns: unknown };
      search_documents: {
        Args: { p_query: string };
        Returns: {
          display_status: string;
          id: string;
          matched_recipient_email: string;
          matched_recipient_name: string;
          title: string;
          updated_at: string;
        }[];
      };
      set_default_signature: { Args: { p_id: string }; Returns: undefined };
      shares_document_with: { Args: { p_profile_id: string }; Returns: boolean };
    };
    Enums: {
      document_status: 'draft' | 'in_progress' | 'completed' | 'declined' | 'expired' | 'voided';
      event_type:
        | 'DOCUMENT_CREATED'
        | 'DOCUMENT_UPLOADED'
        | 'DOCUMENT_RENAMED'
        | 'DOCUMENT_SENT'
        | 'RECIPIENT_NOTIFIED'
        | 'DOCUMENT_VIEWED'
        | 'ESIGN_CONSENT_ACCEPTED'
        | 'OTP_VERIFIED'
        | 'FIELDS_COMPLETED'
        | 'DOCUMENT_SIGNED'
        | 'DOCUMENT_APPROVED'
        | 'DOCUMENT_DECLINED'
        | 'REMINDER_SENT'
        | 'RECIPIENT_UPDATED'
        | 'DOCUMENT_COMPLETED'
        | 'DOCUMENT_DOWNLOADED'
        | 'DOCUMENT_VOIDED'
        | 'DOCUMENT_EXPIRED'
        | 'DOCUMENT_DELETED';
      recipient_role: 'signer' | 'approver' | 'viewer' | 'cc';
      recipient_status: 'pending' | 'sent' | 'viewed' | 'signed' | 'approved' | 'declined';
      signature_kind: 'signature' | 'initials';
      signature_method: 'drawn' | 'typed' | 'uploaded';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      document_status: ['draft', 'in_progress', 'completed', 'declined', 'expired', 'voided'],
      event_type: [
        'DOCUMENT_CREATED',
        'DOCUMENT_UPLOADED',
        'DOCUMENT_RENAMED',
        'DOCUMENT_SENT',
        'RECIPIENT_NOTIFIED',
        'DOCUMENT_VIEWED',
        'ESIGN_CONSENT_ACCEPTED',
        'OTP_VERIFIED',
        'FIELDS_COMPLETED',
        'DOCUMENT_SIGNED',
        'DOCUMENT_APPROVED',
        'DOCUMENT_DECLINED',
        'REMINDER_SENT',
        'RECIPIENT_UPDATED',
        'DOCUMENT_COMPLETED',
        'DOCUMENT_DOWNLOADED',
        'DOCUMENT_VOIDED',
        'DOCUMENT_EXPIRED',
        'DOCUMENT_DELETED',
      ],
      recipient_role: ['signer', 'approver', 'viewer', 'cc'],
      recipient_status: ['pending', 'sent', 'viewed', 'signed', 'approved', 'declined'],
      signature_kind: ['signature', 'initials'],
      signature_method: ['drawn', 'typed', 'uploaded'],
    },
  },
} as const;
